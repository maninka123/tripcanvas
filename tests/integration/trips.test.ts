import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { tripMutations, tripTravellers, users } from '@/db/schema';
import { makeActivity, makeDestinationInput, makeExpense, makeStay, makeTransport } from '@/features/trips/factory';
import { operationSchema, type Operation, type OperationInput } from '@/features/trips/operations';
import { getTripRole, requireTripRole } from '@/server/trips/access';
import { applyMutation, createTrip, listTripSummaries, loadAggregate, restoreTrip, softDeleteTrip } from '@/server/trips/repository';
import type { CurrentUser } from '@/server/auth';
import { createTestDatabase, type TestDatabase } from './d1';

let database: TestDatabase;
const owner: CurrentUser = { id: 'user-owner', email: 'owner@example.com', displayName: 'Owner' };
const friend: CurrentUser = { id: 'user-friend', email: 'friend@example.com', displayName: 'Friend' };
const stranger: CurrentUser = { id: 'user-stranger', email: 'stranger@example.com', displayName: 'Stranger' };

const ops = (...inputs: OperationInput[]): Operation[] => inputs.map((input) => operationSchema.parse({ ...input, id: crypto.randomUUID() }));

async function mutate(user: CurrentUser, tripId: string, operations: Operation[], mutationId: string = crypto.randomUUID()) {
  const current = await loadAggregate(database.db, tripId);
  return applyMutation(database.db, user, tripId, { mutationId, baseVersion: current.trip.version, operations, source: 'user' });
}

beforeAll(async () => {
  database = await createTestDatabase();
  for (const user of [owner, friend, stranger]) await database.db.insert(users).values({ id: user.id, email: user.email, displayName: user.displayName });
}, 60_000);

afterAll(async () => { await database?.dispose(); });

describe('trip persistence', () => {
  const tripId = crypto.randomUUID();

  it('creates a trip with dates and destinations and reads it back intact', async () => {
    const created = await createTrip(database.db, owner, { id: tripId, name: 'China in spring', currency: 'AUD' }, ops(
      { type: 'trip.setDates', dateMode: 'fixed', startDate: '2027-04-01', dayCount: 12 },
      { type: 'destination.add', destination: makeDestinationInput({ id: 'shanghai', name: 'Shanghai', country: 'China', lat: 31.23, lng: 121.47, timezone: 'Asia/Shanghai' }), dayCount: 3 },
      { type: 'destination.add', destination: makeDestinationInput({ id: 'lijiang', name: 'Lijiang', country: 'China', lat: 26.87, lng: 100.23 }), dayCount: 3 },
    ));
    expect(created.trip.version).toBe(1);
    const reloaded = await loadAggregate(database.db, tripId);
    expect(reloaded.days).toHaveLength(12);
    expect(reloaded.days[0]).toMatchObject({ number: 1, date: '2027-04-01', destinationId: 'shanghai' });
    expect(reloaded.destinations.map((destination) => [destination.name, destination.startDay, destination.endDay])).toEqual([['Shanghai', 1, 3], ['Lijiang', 4, 6]]);
    expect(reloaded.members).toEqual([expect.objectContaining({ role: 'owner', userId: owner.id })]);
  });

  it('persists activities, transport, stays and expenses exactly as the reducer produced them', async () => {
    const before = await loadAggregate(database.db, tripId);
    const [d1, d2, , d4] = before.days;
    await mutate(owner, tripId, ops(
      { type: 'activity.add', activity: makeActivity({ id: 'bund', title: 'The Bund', dayId: d1.id, startTime: '18:00', durationMinutes: 90, place: { name: 'The Bund', lat: 31.24, lng: 121.49, providerId: 'osm:W1' }, cost: 0, currency: 'CNY' }) },
      { type: 'activity.add', activity: makeActivity({ id: 'yu', title: 'Yu Garden', dayId: d2.id, timeSlot: 'morning', cost: 40, currency: 'CNY', bookingStatus: 'booked', bookingReference: 'YU-1', url: 'https://example.com' }) },
      { type: 'activity.add', activity: makeActivity({ id: 'flight', title: 'Fly to Lijiang', kind: 'transport', dayId: d4.id, cost: 180, transport: makeTransport({ mode: 'flight', from: { name: 'Shanghai Pudong', lat: 31.14, lng: 121.8 }, to: { name: 'Lijiang Sanyi', lat: 26.68, lng: 100.25 }, departTime: '08:10', arriveTime: '11:55', departTimezone: 'Asia/Shanghai', arriveTimezone: 'Asia/Shanghai', operator: 'China Eastern', serviceNumber: 'MU5801' }) }) },
      { type: 'activity.add', activity: makeActivity({ id: 'idea', title: 'Jade Dragon Snow Mountain', dayId: null, destinationId: 'lijiang' }) },
      { type: 'stay.add', stay: makeStay({ id: 'hotel', name: 'Bund Hotel', destinationId: 'shanghai', startDayId: d1.id, nights: 3, cost: 600, bookingStatus: 'booked', checkInTime: '15:00', phone: '+86 21 0000 0000' }) },
      { type: 'expense.add', expense: makeExpense({ id: 'sim', title: 'SIM card', amount: 100, currency: 'CNY', rate: 0.21, rateSource: 'manual', rateAt: '2026-10-08T00:00:00Z', dayId: d1.id, category: 'other', status: 'paid' }) },
      { type: 'rate.set', rate: { currency: 'CNY', rate: 0.21, at: '2026-10-08T00:00:00Z', source: 'manual' } },
    ));
    const after = await loadAggregate(database.db, tripId);
    const flight = after.activities.find((activity) => activity.id === 'flight')!;
    expect(flight.transport).toMatchObject({ mode: 'flight', departTime: '08:10', arriveTime: '11:55', serviceNumber: 'MU5801', from: { name: 'Shanghai Pudong', lat: 31.14 } });
    expect(after.activities.find((activity) => activity.id === 'yu')).toMatchObject({ bookingStatus: 'booked', bookingReference: 'YU-1', timeSlot: 'morning', url: 'https://example.com' });
    expect(after.activities.find((activity) => activity.id === 'idea')).toMatchObject({ dayId: null, destinationId: 'lijiang' });
    expect(after.stays[0]).toMatchObject({ name: 'Bund Hotel', nights: 3, checkInTime: '15:00', startDayId: d1.id });
    expect(after.expenses[0]).toMatchObject({ amount: 100, rate: 0.21, status: 'paid' });
    expect(after.rates).toEqual([{ currency: 'CNY', rate: 0.21, at: '2026-10-08T00:00:00Z', source: 'manual' }]);
  });

  it('reorders destinations, renumbering days atomically without unique-index collisions', async () => {
    await mutate(owner, tripId, ops({ type: 'destination.move', destinationId: 'lijiang', toIndex: 0 }));
    const after = await loadAggregate(database.db, tripId);
    expect(after.destinations.map((destination) => destination.id)).toEqual(['lijiang', 'shanghai']);
    const bundDay = after.days.find((day) => day.id === after.activities.find((activity) => activity.id === 'bund')!.dayId)!;
    expect(bundDay).toMatchObject({ number: 4, date: '2027-04-04', destinationId: 'shanghai' });
  });

  it('moves an activity across days and keeps sort orders after reload', async () => {
    const before = await loadAggregate(database.db, tripId);
    const target = before.days[0];
    await mutate(owner, tripId, ops({ type: 'activity.move', activityId: 'yu', dayId: target.id, index: 0 }));
    const after = await loadAggregate(database.db, tripId);
    expect(after.activities.find((activity) => activity.id === 'yu')).toMatchObject({ dayId: target.id, sortOrder: 0 });
  });

  it('is idempotent: retrying the same mutation id does not apply it twice', async () => {
    const mutationId = crypto.randomUUID();
    const operations = ops({ type: 'activity.add', activity: makeActivity({ id: 'retry', title: 'Retried', dayId: null }) });
    const first = await mutate(owner, tripId, operations, mutationId);
    const second = await mutate(owner, tripId, operations, mutationId);
    expect(second).toMatchObject({ duplicate: true, version: first.version });
    const after = await loadAggregate(database.db, tripId);
    expect(after.activities.filter((activity) => activity.id === 'retry')).toHaveLength(1);
    expect(after.trip.version).toBe(first.version);
  });

  it('rebases a stale write onto the latest version instead of overwriting it', async () => {
    const stale = await loadAggregate(database.db, tripId);
    await mutate(owner, tripId, ops({ type: 'trip.update', patch: { name: 'Renamed by A' } }));
    const outcome = await applyMutation(database.db, owner, tripId, { mutationId: crypto.randomUUID(), baseVersion: stale.trip.version, operations: ops({ type: 'trip.update', patch: { budget: 5000 } }), source: 'user' });
    expect(outcome.rebased).toBe(true);
    const after = await loadAggregate(database.db, tripId);
    expect(after.trip).toMatchObject({ name: 'Renamed by A', budget: 5000 });
  });

  it('serialises concurrent writers through the version guard', async () => {
    const results = await Promise.all([1, 2, 3, 4].map((index) => mutate(owner, tripId, ops({ type: 'activity.add', activity: makeActivity({ id: `concurrent-${index}`, title: `Concurrent ${index}`, dayId: null }) }))));
    const after = await loadAggregate(database.db, tripId);
    expect(after.activities.filter((activity) => activity.id.startsWith('concurrent-'))).toHaveLength(4);
    expect(new Set(results.map((result) => result.version)).size).toBe(4);
    const log = await database.db.select().from(tripMutations).where(eq(tripMutations.tripId, tripId));
    expect(log.length).toBe(after.trip.version);
  });

  it('rolls back the whole mutation when an operation is invalid', async () => {
    const before = await loadAggregate(database.db, tripId);
    await expect(mutate(owner, tripId, ops(
      { type: 'activity.add', activity: makeActivity({ id: 'half', title: 'Should not persist', dayId: null }) },
      { type: 'activity.remove', activityId: 'does-not-exist' },
    ))).rejects.toMatchObject({ status: 409 });
    const after = await loadAggregate(database.db, tripId);
    expect(after.activities.some((activity) => activity.id === 'half')).toBe(false);
    expect(after.trip.version).toBe(before.trip.version);
  });

  it('shrinking trip dates keeps plans as Ideas in storage', async () => {
    await mutate(owner, tripId, ops({ type: 'trip.setDates', dateMode: 'fixed', startDate: '2027-04-01', dayCount: 3 }));
    const after = await loadAggregate(database.db, tripId);
    expect(after.days).toHaveLength(3);
    expect(after.activities.find((activity) => activity.id === 'bund')).toMatchObject({ dayId: null, destinationId: 'shanghai' });
    // Lijiang moved to the front earlier, so the flight's day (now day 1) is kept.
    expect(after.activities.find((activity) => activity.id === 'flight')!.dayId).toBe(after.days[0].id);
  });

  it('lists the trip with derived planning progress, and soft-deletes and restores it', async () => {
    let summaries = await listTripSummaries(database.db, owner);
    expect(summaries.find((summary) => summary.id === tripId)).toMatchObject({ role: 'owner', dayCount: 3, destinationNames: ['Lijiang', 'Shanghai'] });
    await softDeleteTrip(database.db, tripId);
    expect(await getTripRole(database.db, tripId, owner)).toBeNull();
    summaries = await listTripSummaries(database.db, owner);
    expect(summaries.find((summary) => summary.id === tripId)?.deletedAt).not.toBeNull();
    await restoreTrip(database.db, tripId);
    expect(await getTripRole(database.db, tripId, owner)).toBe('owner');
  });
});

describe('permissions', () => {
  const tripId = crypto.randomUUID();

  beforeAll(async () => {
    await createTrip(database.db, owner, { id: tripId, name: 'Shared trip', currency: 'EUR' }, ops({ type: 'trip.setDates', dateMode: 'flexible', startDate: null, dayCount: 4 }));
  });

  it('denies strangers entirely', async () => {
    expect(await getTripRole(database.db, tripId, stranger)).toBeNull();
    await expect(requireTripRole(database.db, tripId, stranger, 'viewer')).rejects.toMatchObject({ status: 404 });
  });

  it('binds an email invitation to the invited account and enforces viewer limits', async () => {
    await database.db.insert(tripTravellers).values({ id: crypto.randomUUID(), tripId, invitedEmail: 'FRIEND@example.com', role: 'viewer' });
    expect(await requireTripRole(database.db, tripId, friend, 'viewer')).toBe('viewer');
    await expect(requireTripRole(database.db, tripId, friend, 'editor')).rejects.toMatchObject({ status: 403 });
    const [membership] = await database.db.select().from(tripTravellers).where(eq(tripTravellers.invitedEmail, 'FRIEND@example.com'));
    expect(membership.userId).toBe(friend.id);
    const shared = await listTripSummaries(database.db, friend);
    expect(shared).toEqual([expect.objectContaining({ id: tripId, role: 'viewer', ownerName: 'Owner' })]);
  });

  it('lets an editor edit but not act as owner', async () => {
    await database.db.update(tripTravellers).set({ role: 'editor' }).where(eq(tripTravellers.userId, friend.id));
    expect(await requireTripRole(database.db, tripId, friend, 'editor')).toBe('editor');
    await expect(requireTripRole(database.db, tripId, friend, 'owner')).rejects.toMatchObject({ status: 403 });
  });
});
