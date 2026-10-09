import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { accommodations, currencyRates, events, expenses, tripDays, tripMutations, trips, tripSegments } from '@/db/schema';
import type { AggregateDiff } from '@/features/trips/diff';
import type { TripAggregate } from '@/features/trips/types';
import { activityToRow, dayToRow, destinationToRow, expenseToRow, rateToRow, stayToRow, tripToRow } from './mapping';

// Turns an aggregate diff into an ordered list of statements for one D1
// batch. D1 runs a batch as a single transaction, so either every row
// changes or none does.
//
// Statement 1 is the guard: it records the mutation, but writes NULL into the
// NOT NULL `trip_id` column when the stored version is no longer the version
// we read. That constraint failure aborts and rolls back the whole batch,
// which is how a concurrent edit is detected without a separate lock.

type PersistInput = {
  tripId: string;
  before: TripAggregate;
  after: TripAggregate;
  diff: AggregateDiff;
  now: string;
  baseVersion: number;
  mutation: { id: string; userId: string; source: string; label: string | null; operationCount: number };
  touchTrip: boolean;
};

export function buildPersistStatements(db: Db, input: PersistInput) {
  const { tripId, after, diff, now, baseVersion } = input;
  const statements: unknown[] = [];
  const dateOf = (dayId: string | null) => (dayId ? after.days.find((day) => day.id === dayId)?.date ?? null : null);
  const stayIds = new Set(after.stays.map((stay) => stay.id));

  statements.push(db.insert(tripMutations).values({
    id: input.mutation.id,
    tripId: sql`(CASE WHEN (SELECT ${trips.version} FROM ${trips} WHERE ${trips.id} = ${tripId}) = ${baseVersion} THEN ${tripId} ELSE NULL END)` as unknown as string,
    userId: input.mutation.userId,
    version: baseVersion + 1,
    source: input.mutation.source,
    label: input.mutation.label,
    operationCount: input.mutation.operationCount,
  }));

  // Destinations first: days point at them.
  for (const destination of diff.destinations.added) statements.push(db.insert(tripSegments).values({ ...destinationToRow(destination, tripId, after.days, now), createdAt: now }));
  for (const { after: destination } of diff.destinations.updated) statements.push(db.update(tripSegments).set(destinationToRow(destination, tripId, after.days, now)).where(and(eq(tripSegments.id, destination.id), eq(tripSegments.tripId, tripId))));

  // Children of removed rows, then removed days.
  for (const activity of diff.activities.removed) statements.push(db.delete(events).where(and(eq(events.id, activity.id), eq(events.tripId, tripId))));
  for (const stay of diff.stays.removed) statements.push(db.delete(accommodations).where(and(eq(accommodations.id, stay.id), eq(accommodations.tripId, tripId))));
  for (const expense of diff.expenses.removed) statements.push(db.delete(expenses).where(and(eq(expenses.id, expense.id), eq(expenses.tripId, tripId))));
  for (const day of diff.days.removed) statements.push(db.delete(tripDays).where(and(eq(tripDays.id, day.id), eq(tripDays.tripId, tripId))));

  // Day numbers are unique per trip, so renumbering goes through negative
  // placeholders to avoid colliding with a number that is about to be freed.
  const renumbered = diff.days.updated.filter((change) => change.before.number !== change.after.number);
  for (const { after: day } of renumbered) statements.push(db.update(tripDays).set({ ...dayToRow(day, tripId, now), dayNumber: -day.number }).where(and(eq(tripDays.id, day.id), eq(tripDays.tripId, tripId))));
  for (const day of diff.days.added) statements.push(db.insert(tripDays).values({ ...dayToRow(day, tripId, now), createdAt: now }));
  for (const { after: day } of diff.days.updated) statements.push(db.update(tripDays).set(dayToRow(day, tripId, now)).where(and(eq(tripDays.id, day.id), eq(tripDays.tripId, tripId))));

  for (const activity of diff.activities.added) statements.push(db.insert(events).values({ ...activityToRow(activity, tripId, dateOf(activity.dayId), now), createdAt: now }));
  for (const { after: activity } of diff.activities.updated) statements.push(db.update(events).set(activityToRow(activity, tripId, dateOf(activity.dayId), now)).where(and(eq(events.id, activity.id), eq(events.tripId, tripId))));

  for (const stay of diff.stays.added) statements.push(db.insert(accommodations).values({ ...stayToRow(stay, tripId, after.days, now), createdAt: now }));
  for (const { after: stay } of diff.stays.updated) statements.push(db.update(accommodations).set(stayToRow(stay, tripId, after.days, now)).where(and(eq(accommodations.id, stay.id), eq(accommodations.tripId, tripId))));

  for (const expense of diff.expenses.added) statements.push(db.insert(expenses).values({ ...expenseToRow(expense, tripId, after.trip.currency, after.days, stayIds, now), createdAt: now }));
  for (const { after: expense } of diff.expenses.updated) statements.push(db.update(expenses).set(expenseToRow(expense, tripId, after.trip.currency, after.days, stayIds, now)).where(and(eq(expenses.id, expense.id), eq(expenses.tripId, tripId))));

  for (const rate of diff.rates.removed) statements.push(db.delete(currencyRates).where(and(eq(currencyRates.id, `${tripId}:${rate.currency}`), eq(currencyRates.tripId, tripId))));
  for (const rate of [...diff.rates.added, ...diff.rates.updated.map((change) => change.after)]) {
    const row = rateToRow(rate, tripId, after.trip.currency, now);
    statements.push(db.insert(currencyRates).values({ ...row, createdAt: now }).onConflictDoUpdate({ target: currencyRates.id, set: row }));
  }

  for (const destination of diff.destinations.removed) statements.push(db.delete(tripSegments).where(and(eq(tripSegments.id, destination.id), eq(tripSegments.tripId, tripId))));

  if (input.touchTrip) {
    statements.push(db.update(trips).set({ ...tripToRow(after.trip, now), version: baseVersion + 1 }).where(eq(trips.id, tripId)));
  }
  return statements;
}
