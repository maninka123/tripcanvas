import type { Operation } from './operations';
import type { Rate, Trip, TripAggregate } from './types';

// Compares two versions of a trip. The server uses the diff to write only the
// rows that changed; the client uses it to build an exact undo operation.

export type EntityDiff<T> = { added: T[]; updated: { before: T; after: T }[]; removed: T[] };

export type AggregateDiff = {
  tripChanged: boolean;
  destinations: EntityDiff<TripAggregate['destinations'][number]>;
  days: EntityDiff<TripAggregate['days'][number]>;
  activities: EntityDiff<TripAggregate['activities'][number]>;
  stays: EntityDiff<TripAggregate['stays'][number]>;
  expenses: EntityDiff<TripAggregate['expenses'][number]>;
  rates: EntityDiff<Rate & { id: string }>;
};

const TRIP_FIELDS = ['name', 'dateMode', 'startDate', 'dayCount', 'currency', 'budget', 'travellers', 'pace', 'interests', 'notes', 'coverImageUrl', 'coverCredit', 'archivedAt'] as const satisfies readonly (keyof Trip)[];

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function diffEntities<T extends { id: string }>(before: T[], after: T[]): EntityDiff<T> {
  const beforeById = new Map(before.map((item) => [item.id, item]));
  const afterIds = new Set(after.map((item) => item.id));
  const result: EntityDiff<T> = { added: [], updated: [], removed: [] };
  for (const item of after) {
    const previous = beforeById.get(item.id);
    if (!previous) result.added.push(item);
    else if (!same(previous, item)) result.updated.push({ before: previous, after: item });
  }
  for (const item of before) if (!afterIds.has(item.id)) result.removed.push(item);
  return result;
}

const withRateId = (rates: Rate[]) => rates.map((rate) => ({ ...rate, id: rate.currency }));

export function diffAggregates(before: TripAggregate, after: TripAggregate): AggregateDiff {
  return {
    tripChanged: TRIP_FIELDS.some((field) => !same(before.trip[field], after.trip[field])),
    destinations: diffEntities(before.destinations, after.destinations),
    days: diffEntities(before.days, after.days),
    activities: diffEntities(before.activities, after.activities),
    stays: diffEntities(before.stays, after.stays),
    expenses: diffEntities(before.expenses, after.expenses),
    rates: diffEntities(withRateId(before.rates), withRateId(after.rates)),
  };
}

export function isEmptyDiff(diff: AggregateDiff): boolean {
  return !diff.tripChanged && (['destinations', 'days', 'activities', 'stays', 'expenses', 'rates'] as const)
    .every((key) => !diff[key].added.length && !diff[key].updated.length && !diff[key].removed.length);
}

/**
 * Builds a single `restore` operation that turns `after` back into `before`.
 * Returns null when nothing changed.
 */
export function inverseOperation(before: TripAggregate, after: TripAggregate, id: string = crypto.randomUUID()): Operation | null {
  const diff = diffAggregates(before, after);
  if (isEmptyDiff(diff)) return null;
  const putOf = <T,>(entity: EntityDiff<T>) => [...entity.updated.map((change) => change.before), ...entity.removed];
  const removeOf = <T extends { id: string },>(entity: EntityDiff<T>) => entity.added.map((item) => item.id);
  const trip = before.trip;
  return {
    id,
    type: 'restore',
    trip: diff.tripChanged ? {
      name: trip.name,
      currency: trip.currency,
      budget: trip.budget,
      travellers: trip.travellers,
      pace: trip.pace,
      interests: trip.interests,
      notes: trip.notes,
      coverImageUrl: trip.coverImageUrl,
      coverCredit: trip.coverCredit,
      archived: trip.archivedAt !== null,
    } : undefined,
    dates: trip.dateMode !== after.trip.dateMode || trip.startDate !== after.trip.startDate ? { dateMode: trip.dateMode, startDate: trip.startDate } : undefined,
    put: {
      destinations: putOf(diff.destinations),
      days: putOf(diff.days),
      activities: putOf(diff.activities),
      stays: putOf(diff.stays),
      expenses: putOf(diff.expenses),
      rates: putOf(diff.rates).map(({ id: _id, ...rate }) => { void _id; return rate; }),
    },
    remove: {
      destinations: removeOf(diff.destinations),
      days: removeOf(diff.days),
      activities: removeOf(diff.activities),
      stays: removeOf(diff.stays),
      expenses: removeOf(diff.expenses),
      rates: diff.rates.added.map((rate) => rate.currency),
    },
  };
}
