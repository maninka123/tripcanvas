import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import {
  accommodations, attachments, currencyRates, events, expenses, tripDays, tripMutations, trips, tripSegments, tripTravellers, users,
} from '@/db/schema';
import { diffAggregates, isEmptyDiff } from '@/features/trips/diff';
import { makeTrip } from '@/features/trips/factory';
import type { Operation } from '@/features/trips/operations';
import { applyOperations, normalize, OperationError } from '@/features/trips/reducer';
import { planningChecklist, tripEnd } from '@/features/trips/selectors';
import type { Member, TripAggregate, TripRole, TripSummary } from '@/features/trips/types';
import type { CurrentUser } from '@/server/auth';
import { ApiError, notFound } from '@/server/http';
import {
  activityFromRow, attachmentFromRow, dayFromRow, destinationFromRow, expenseFromRow, rateFromRow, stayFromRow, tripFromRow, tripToRow,
} from './mapping';
import { buildPersistStatements } from './persist';

const CHUNK = 80; // D1 allows 100 bound parameters per statement.

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function selectIn<T>(ids: string[], query: (part: string[]) => Promise<T[]>): Promise<T[]> {
  const results = await Promise.all(chunks(ids).map(query));
  return results.flat();
}

/** Loads complete aggregates for the given trips (deleted trips included; callers filter). */
export async function loadAggregates(db: Db, tripIds: string[]): Promise<Map<string, TripAggregate>> {
  const result = new Map<string, TripAggregate>();
  if (!tripIds.length) return result;
  const [tripRows, segmentRows, dayRows, eventRows, stayRows, expenseRows, rateRows, attachmentRows, memberRows] = await Promise.all([
    selectIn(tripIds, (part) => db.select().from(trips).where(inArray(trips.id, part))),
    selectIn(tripIds, (part) => db.select().from(tripSegments).where(inArray(tripSegments.tripId, part)).orderBy(asc(tripSegments.sortOrder))),
    selectIn(tripIds, (part) => db.select().from(tripDays).where(inArray(tripDays.tripId, part)).orderBy(asc(tripDays.dayNumber))),
    selectIn(tripIds, (part) => db.select().from(events).where(and(inArray(events.tripId, part), isNull(events.deletedAt))).orderBy(asc(events.sortOrder))),
    selectIn(tripIds, (part) => db.select().from(accommodations).where(and(inArray(accommodations.tripId, part), isNull(accommodations.deletedAt)))),
    selectIn(tripIds, (part) => db.select().from(expenses).where(and(inArray(expenses.tripId, part), isNull(expenses.deletedAt))).orderBy(asc(expenses.createdAt))),
    selectIn(tripIds, (part) => db.select().from(currencyRates).where(inArray(currencyRates.tripId, part))),
    selectIn(tripIds, (part) => db.select().from(attachments).where(and(inArray(attachments.tripId, part), isNull(attachments.deletedAt))).orderBy(asc(attachments.createdAt))),
    selectIn(tripIds, (part) => db.select({ traveller: tripTravellers, user: users }).from(tripTravellers).leftJoin(users, eq(users.id, tripTravellers.userId)).where(and(inArray(tripTravellers.tripId, part), isNull(tripTravellers.deletedAt)))),
  ]);
  for (const row of tripRows) {
    const trip = tripFromRow(row);
    const destinations = segmentRows.filter((segment) => segment.tripId === row.id).map(destinationFromRow);
    const members: Member[] = memberRows.filter(({ traveller }) => traveller.tripId === row.id).map(({ traveller, user }) => ({
      id: traveller.id,
      email: user?.email ?? traveller.invitedEmail ?? '',
      userId: traveller.userId,
      displayName: user?.displayName ?? null,
      role: (['owner', 'editor', 'viewer'].includes(traveller.role) ? traveller.role : 'viewer') as TripRole,
    }));
    const aggregate: TripAggregate = {
      trip,
      destinations,
      days: dayRows.filter((day) => day.tripId === row.id).map(dayFromRow),
      activities: eventRows.filter((event) => event.tripId === row.id).map(activityFromRow),
      stays: stayRows.filter((stay) => stay.tripId === row.id).map(stayFromRow),
      expenses: expenseRows.filter((expense) => expense.tripId === row.id).map(expenseFromRow),
      rates: rateRows.filter((rate) => rate.tripId === row.id).map(rateFromRow),
      attachments: attachmentRows.filter((attachment) => attachment.tripId === row.id).map(attachmentFromRow),
      members,
    };
    // Normalising on read repairs any legacy inconsistency without writing.
    result.set(row.id, normalize(aggregate));
  }
  return result;
}

export async function loadAggregate(db: Db, tripId: string): Promise<TripAggregate> {
  const aggregate = (await loadAggregates(db, [tripId])).get(tripId);
  if (!aggregate) throw notFound('Trip not found.');
  return aggregate;
}

/** Trips the user owns or has been invited to, with derived planning progress. */
export async function listTripSummaries(db: Db, user: CurrentUser): Promise<TripSummary[]> {
  const owned = await db.select({ id: trips.id }).from(trips).where(eq(trips.ownerId, user.id)).orderBy(desc(trips.updatedAt));
  const shared = await db.select({ id: tripTravellers.tripId, role: tripTravellers.role })
    .from(tripTravellers)
    .innerJoin(trips, eq(trips.id, tripTravellers.tripId))
    .where(and(isNull(tripTravellers.deletedAt), isNull(trips.deletedAt), sql`${trips.ownerId} <> ${user.id}`, or(eq(tripTravellers.userId, user.id), eq(sql`lower(${tripTravellers.invitedEmail})`, user.email))));
  const roles = new Map<string, TripRole>(owned.map((row) => [row.id, 'owner']));
  for (const row of shared) if (!roles.has(row.id)) roles.set(row.id, row.role === 'editor' ? 'editor' : 'viewer');
  const ids = [...roles.keys()];
  const [aggregates, tripRows] = await Promise.all([
    loadAggregates(db, ids),
    selectIn(ids, (part) => db.select({ id: trips.id, deletedAt: trips.deletedAt, ownerName: users.displayName }).from(trips).leftJoin(users, eq(users.id, trips.ownerId)).where(inArray(trips.id, part))),
  ]);
  const meta = new Map(tripRows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const aggregate = aggregates.get(id);
    if (!aggregate) return [];
    const { trip } = aggregate;
    const ordered = [...aggregate.destinations].sort((a, b) => a.sortOrder - b.sortOrder);
    return [{
      id,
      name: trip.name,
      dateMode: trip.dateMode,
      startDate: trip.startDate,
      endDate: tripEnd(aggregate),
      dayCount: aggregate.days.length,
      destinationNames: ordered.map((destination) => destination.name),
      countries: [...new Set(ordered.map((destination) => destination.country).filter(Boolean))],
      coverImageUrl: trip.coverImageUrl ?? ordered.find((destination) => destination.imageUrl)?.imageUrl ?? null,
      role: roles.get(id)!,
      ownerName: roles.get(id) === 'owner' ? null : meta.get(id)?.ownerName ?? null,
      archivedAt: trip.archivedAt,
      deletedAt: meta.get(id)?.deletedAt ?? null,
      isSample: trip.isSample,
      updatedAt: trip.updatedAt,
      planning: planningChecklist(aggregate),
    }];
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Creates an empty trip row (plus owner membership) and applies the initial operations. */
export async function createTrip(db: Db, user: CurrentUser, input: { id: string; name: string; currency: string; isSample?: boolean; coverImageUrl?: string | null; coverCredit?: string | null }, operations: Operation[]): Promise<TripAggregate> {
  const now = new Date().toISOString();
  const trip = makeTrip({ id: input.id, name: input.name, ownerId: user.id, currency: input.currency, isSample: input.isSample ?? false, coverImageUrl: input.coverImageUrl ?? null, coverCredit: input.coverCredit ?? null, dayCount: 0, createdAt: now, updatedAt: now });
  const existing = await db.select({ id: trips.id, ownerId: trips.ownerId }).from(trips).where(eq(trips.id, input.id)).limit(1);
  if (existing.length) {
    // Retried creation: return the trip if it is ours, rather than creating a duplicate.
    if (existing[0].ownerId !== user.id) throw new ApiError(409, 'conflict', 'That trip id is already in use.');
    return loadAggregate(db, input.id);
  }
  await db.batch([
    db.insert(trips).values({ id: trip.id, ownerId: user.id, ...tripToRow(trip, now), createdAt: now }),
    db.insert(tripTravellers).values({ id: `${trip.id}:owner`, tripId: trip.id, userId: user.id, role: 'owner' }),
  ]);
  const empty: TripAggregate = { trip, destinations: [], days: [], activities: [], stays: [], expenses: [], rates: [], attachments: [], members: [] };
  if (operations.length) await applyMutation(db, user, trip.id, { mutationId: crypto.randomUUID(), baseVersion: 0, operations, source: 'user', label: 'Create trip' }, empty);
  return loadAggregate(db, trip.id);
}

export type MutationOutcome = { version: number; notices: string[]; duplicate: boolean; rebased: boolean };

const GUARD_FAILURE = /NOT NULL constraint failed: trip_mutations\.trip_id/i;
const DUPLICATE = /UNIQUE constraint failed: trip_mutations\.id/i;

/**
 * Applies operations to the latest stored trip and persists the difference
 * in one atomic D1 batch. If another write lands between our read and our
 * write, the version guard aborts the batch and we re-apply on fresh data.
 */
export async function applyMutation(
  db: Db,
  user: CurrentUser,
  tripId: string,
  request: { mutationId: string; baseVersion: number; operations: Operation[]; source: 'user' | 'assistant' | 'undo'; label?: string },
  preloaded?: TripAggregate,
): Promise<MutationOutcome> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const [done] = await db.select({ version: tripMutations.version }).from(tripMutations).where(eq(tripMutations.id, request.mutationId)).limit(1);
    if (done) return { version: done.version, notices: [], duplicate: true, rebased: false };

    const before = attempt === 0 && preloaded ? preloaded : await loadAggregate(db, tripId);
    const now = new Date().toISOString();
    let result;
    try {
      result = applyOperations(before, request.operations, { now });
    } catch (error) {
      if (error instanceof OperationError) throw new ApiError(error.code === 'not_found' ? 409 : 422, 'conflict', error.message);
      throw error;
    }
    const after = result.aggregate;
    const nextVersion = before.trip.version + 1;
    const diff = diffAggregates(before, after);
    const statements = buildPersistStatements(db, {
      tripId, before, after, diff, now, baseVersion: before.trip.version,
      mutation: { id: request.mutationId, userId: user.id, source: request.source, label: request.label ?? null, operationCount: request.operations.length },
      touchTrip: true,
    });
    try {
      await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
      return { version: nextVersion, notices: isEmptyDiff(diff) ? [] : result.notices, duplicate: false, rebased: before.trip.version !== request.baseVersion };
    } catch (error) {
      const message = error instanceof Error ? `${error.message} ${String((error as { cause?: unknown }).cause ?? '')}` : String(error);
      if (DUPLICATE.test(message)) continue; // A concurrent retry of the same mutation won; report it on the next pass.
      if (GUARD_FAILURE.test(message)) continue; // Someone else wrote first; re-read and re-apply.
      throw error;
    }
  }
  throw new ApiError(409, 'conflict', 'This trip is being edited by someone else right now. Please try again.');
}

export async function softDeleteTrip(db: Db, tripId: string): Promise<void> {
  const now = new Date().toISOString();
  await db.update(trips).set({ deletedAt: now, updatedAt: now, version: sql`${trips.version} + 1` }).where(eq(trips.id, tripId));
}

export async function restoreTrip(db: Db, tripId: string): Promise<void> {
  const now = new Date().toISOString();
  await db.update(trips).set({ deletedAt: null, updatedAt: now, version: sql`${trips.version} + 1` }).where(eq(trips.id, tripId));
}

/** Permanently removes trips deleted more than `days` ago (child rows cascade). */
export async function purgeDeletedTrips(db: Db, ownerId: string, days = 30): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const removed = await db.delete(trips).where(and(eq(trips.ownerId, ownerId), sql`${trips.deletedAt} IS NOT NULL AND ${trips.deletedAt} < ${cutoff}`)).returning({ id: trips.id });
  return removed.length;
}
