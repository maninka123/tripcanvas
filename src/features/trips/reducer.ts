import { dayDate, MAX_TRIP_DAYS } from '@/lib/dates';
import type { Operation, OperationOf, SectionPayload } from './operations';
import type { Activity, Day, Destination, Stay, TripAggregate } from './types';

// Pure trip reducer. Runs in the browser for instant feedback and on the
// server as the authority, so both sides always agree on the outcome of an
// operation. Identifiers for entities an operation creates are derived from
// the operation id, which keeps the result deterministic on both sides.

export class OperationError extends Error {
  constructor(message: string, readonly code: 'not_found' | 'invalid_operation' = 'invalid_operation') {
    super(message);
    this.name = 'OperationError';
  }
}

export type ApplyContext = { now: string };
export type ApplyResult = { aggregate: TripAggregate; notices: string[] };

export const DESTINATION_COLORS = ['#2f6f57', '#c2643f', '#4f6d9a', '#b0812f', '#7a5a8c', '#3f8a8c', '#a2524f', '#5f7d3a'];

const UNASSIGNED_ORDER = Number.MAX_SAFE_INTEGER;

export function applyOperations(aggregate: TripAggregate, operations: Operation[], context: ApplyContext = { now: new Date().toISOString() }): ApplyResult {
  let draft = clone(aggregate);
  const notices: string[] = [];
  for (const operation of operations) {
    applyOne(draft, operation, notices, context);
    draft = normalize(draft);
  }
  return { aggregate: draft, notices };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function find<T extends { id: string }>(items: T[], id: string, label: string): T {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw new OperationError(`${label} not found. It may have been removed by someone else.`, 'not_found');
  return item;
}

function daysOf(aggregate: TripAggregate, destinationId: string): Day[] {
  return aggregate.days.filter((day) => day.destinationId === destinationId).sort((a, b) => a.number - b.number);
}

function unassignedDays(aggregate: TripAggregate): Day[] {
  return aggregate.days.filter((day) => day.destinationId === null).sort((a, b) => a.number - b.number);
}

function newDay(id: string, number: number, destinationId: string | null): Day {
  return { id, number, date: null, destinationId, title: '', notes: '' };
}

/** Moves every activity on the given days into Ideas, keeping their destination. Returns how many moved. */
function moveDayActivitiesToIdeas(aggregate: TripAggregate, dayIds: Set<string>): number {
  let moved = 0;
  for (const activity of aggregate.activities) {
    if (activity.dayId && dayIds.has(activity.dayId)) {
      const day = aggregate.days.find((candidate) => candidate.id === activity.dayId);
      activity.destinationId = day?.destinationId ?? activity.destinationId;
      activity.dayId = null;
      activity.sortOrder = UNASSIGNED_ORDER - 1;
      moved += 1;
    }
  }
  return moved;
}

function assertDayLimit(aggregate: TripAggregate, extra: number) {
  if (aggregate.days.length + extra > MAX_TRIP_DAYS) throw new OperationError(`Trips can have at most ${MAX_TRIP_DAYS} days.`);
}

function applyOne(draft: TripAggregate, operation: Operation, notices: string[], context: ApplyContext): void {
  switch (operation.type) {
    case 'trip.update': return tripUpdate(draft, operation, context, notices);
    case 'trip.setDates': return tripSetDates(draft, operation, notices);
    case 'destination.add': return destinationAdd(draft, operation, notices);
    case 'destination.update': {
      Object.assign(find(draft.destinations, operation.destinationId, 'Destination'), operation.patch);
      return;
    }
    case 'destination.remove': return destinationRemove(draft, operation);
    case 'destination.move': return destinationMove(draft, operation);
    case 'destination.setDays': return destinationSetDays(draft, operation, notices);
    case 'day.update': {
      Object.assign(find(draft.days, operation.dayId, 'Day'), operation.patch);
      return;
    }
    case 'day.remove': return dayRemove(draft, operation, notices);
    case 'activity.add': return activityAdd(draft, operation);
    case 'activity.update': return activityUpdate(draft, operation);
    case 'activity.move': return activityMove(draft, operation);
    case 'activity.remove': {
      find(draft.activities, operation.activityId, 'Activity');
      draft.activities = draft.activities.filter((activity) => activity.id !== operation.activityId);
      return;
    }
    case 'stay.add': {
      if (draft.stays.some((stay) => stay.id === operation.stay.id)) throw new OperationError('That stay already exists.');
      assertRefs(draft, { dayId: operation.stay.startDayId, destinationId: operation.stay.destinationId });
      draft.stays.push({ ...operation.stay });
      return;
    }
    case 'stay.update': {
      const stay = find(draft.stays, operation.stayId, 'Stay');
      assertRefs(draft, { dayId: operation.patch.startDayId ?? null, destinationId: operation.patch.destinationId ?? null });
      Object.assign(stay, operation.patch);
      return;
    }
    case 'stay.remove': {
      find(draft.stays, operation.stayId, 'Stay');
      draft.stays = draft.stays.filter((stay) => stay.id !== operation.stayId);
      return;
    }
    case 'expense.add': {
      if (draft.expenses.some((expense) => expense.id === operation.expense.id)) throw new OperationError('That expense already exists.');
      draft.expenses.push({ ...operation.expense });
      return;
    }
    case 'expense.update': {
      Object.assign(find(draft.expenses, operation.expenseId, 'Expense'), operation.patch);
      return;
    }
    case 'expense.remove': {
      find(draft.expenses, operation.expenseId, 'Expense');
      draft.expenses = draft.expenses.filter((expense) => expense.id !== operation.expenseId);
      return;
    }
    case 'rate.set': {
      draft.rates = [...draft.rates.filter((rate) => rate.currency !== operation.rate.currency), { ...operation.rate }];
      return;
    }
    case 'rate.remove': {
      draft.rates = draft.rates.filter((rate) => rate.currency !== operation.currency);
      return;
    }
    case 'section.insert': return sectionInsert(draft, operation, notices);
    case 'restore': return restore(draft, operation, context);
  }
}

function assertRefs(draft: TripAggregate, refs: { dayId?: string | null; destinationId?: string | null }) {
  if (refs.dayId && !draft.days.some((day) => day.id === refs.dayId)) throw new OperationError('That day no longer exists.', 'not_found');
  if (refs.destinationId && !draft.destinations.some((destination) => destination.id === refs.destinationId)) throw new OperationError('That destination no longer exists.', 'not_found');
}

function tripUpdate(draft: TripAggregate, operation: OperationOf<'trip.update'>, context: ApplyContext, notices: string[] = []) {
  const { archived, ...patch } = operation.patch;
  if (patch.currency && patch.currency !== draft.trip.currency && draft.rates.length) {
    // Rates convert *into* the trip currency, so they no longer apply.
    draft.rates = [];
    notices.push('Exchange rates were cleared because the trip currency changed. Add rates for the new currency in Budget.');
  }
  Object.assign(draft.trip, patch);
  if (archived !== undefined) draft.trip.archivedAt = archived ? (draft.trip.archivedAt ?? context.now) : null;
}

function tripSetDates(draft: TripAggregate, operation: OperationOf<'trip.setDates'>, notices: string[]) {
  if (operation.dateMode === 'fixed' && !operation.startDate) throw new OperationError('Choose a start date, or switch to flexible dates.');
  draft.trip.dateMode = operation.dateMode;
  draft.trip.startDate = operation.dateMode === 'fixed' ? operation.startDate : null;
  const ordered = [...draft.days].sort((a, b) => a.number - b.number);
  const current = ordered.length;
  if (operation.dayCount > current) {
    for (let index = 0; index < operation.dayCount - current; index += 1) {
      draft.days.push(newDay(`${operation.id}:day:${index}`, current + index + 1, null));
    }
  } else if (operation.dayCount < current) {
    const removed = ordered.slice(operation.dayCount);
    const removedIds = new Set(removed.map((day) => day.id));
    const moved = moveDayActivitiesToIdeas(draft, removedIds);
    let staysUnscheduled = 0;
    for (const stay of draft.stays) {
      if (stay.startDayId && removedIds.has(stay.startDayId)) { stay.startDayId = null; staysUnscheduled += 1; }
    }
    draft.days = draft.days.filter((day) => !removedIds.has(day.id));
    notices.push(`Removed ${plural(removed.length, 'day')} from the end of the trip.`);
    if (moved) notices.push(`${plural(moved, 'plan')} moved to Ideas so nothing was lost.`);
    if (staysUnscheduled) notices.push(`${plural(staysUnscheduled, 'stay')} no longer have a check-in day.`);
  }
}

function destinationAdd(draft: TripAggregate, operation: OperationOf<'destination.add'>, notices: string[]) {
  if (draft.destinations.some((destination) => destination.id === operation.destination.id)) throw new OperationError('That destination already exists.');
  const index = Math.min(operation.index ?? draft.destinations.length, draft.destinations.length);
  const destination: Destination = {
    ...operation.destination,
    color: operation.destination.color ?? DESTINATION_COLORS[draft.destinations.length % DESTINATION_COLORS.length],
    sortOrder: index - 0.5,
    startDay: null,
    endDay: null,
  };
  draft.destinations.push(destination);
  allocateDays(draft, destination.id, operation.dayCount, `${operation.id}:day`, notices);
}

/** Gives a destination `count` more days: unassigned days first, then new days appended to the trip. */
function allocateDays(draft: TripAggregate, destinationId: string, count: number, idPrefix: string, notices: string[]) {
  if (count <= 0) return;
  const existing = daysOf(draft, destinationId);
  const base = existing.length ? existing[existing.length - 1].number : 0;
  const pool = unassignedDays(draft);
  const claimed = pool.slice(0, count);
  claimed.forEach((day, index) => { day.destinationId = destinationId; day.number = base + 0.5 + index / 1000; });
  const missing = count - claimed.length;
  assertDayLimit(draft, missing);
  for (let index = 0; index < missing; index += 1) {
    draft.days.push(newDay(`${idPrefix}:${index}`, base + 0.6 + index / 1000, destinationId));
  }
  if (missing > 0 && draft.trip.dateMode === 'fixed') notices.push(`Trip extended by ${plural(missing, 'day')} to fit.`);
}

function destinationRemove(draft: TripAggregate, operation: OperationOf<'destination.remove'>) {
  find(draft.destinations, operation.destinationId, 'Destination');
  for (const day of draft.days) if (day.destinationId === operation.destinationId) { day.destinationId = null; day.number += UNASSIGNED_ORDER / 2; }
  for (const activity of draft.activities) if (activity.destinationId === operation.destinationId) activity.destinationId = null;
  for (const stay of draft.stays) if (stay.destinationId === operation.destinationId) stay.destinationId = null;
  draft.destinations = draft.destinations.filter((destination) => destination.id !== operation.destinationId);
}

function destinationMove(draft: TripAggregate, operation: OperationOf<'destination.move'>) {
  const ordered = [...draft.destinations].sort((a, b) => a.sortOrder - b.sortOrder);
  const from = ordered.findIndex((destination) => destination.id === operation.destinationId);
  if (from < 0) throw new OperationError('Destination not found.', 'not_found');
  const [moved] = ordered.splice(from, 1);
  ordered.splice(Math.min(operation.toIndex, ordered.length), 0, moved);
  ordered.forEach((destination, index) => { destination.sortOrder = index; });
}

function destinationSetDays(draft: TripAggregate, operation: OperationOf<'destination.setDays'>, notices: string[]) {
  const destination = find(draft.destinations, operation.destinationId, 'Destination');
  const own = daysOf(draft, destination.id);
  const difference = operation.dayCount - own.length;
  if (difference > 0) {
    const lastNumber = own.length ? own[own.length - 1].number : null;
    allocateDays(draft, destination.id, difference, `${operation.id}:day`, notices);
    // A stay that ran to the destination's last night keeps covering the new nights.
    if (lastNumber !== null) {
      for (const stay of draft.stays) {
        const start = own.find((day) => day.id === stay.startDayId);
        if (stay.destinationId === destination.id && start && start.number + stay.nights - 1 >= lastNumber) stay.nights += difference;
      }
    }
    return;
  }
  if (difference === 0) return;
  const released = own.slice(operation.dayCount);
  const releasedIds = new Set(released.map((day) => day.id));
  const moved = moveDayActivitiesToIdeas(draft, releasedIds);
  const kept = own.slice(0, operation.dayCount);
  for (const stay of draft.stays) {
    if (stay.startDayId && releasedIds.has(stay.startDayId)) {
      stay.startDayId = kept.length ? kept[kept.length - 1].id : null;
      stay.nights = 1;
      continue;
    }
    const startIndex = kept.findIndex((day) => day.id === stay.startDayId);
    if (startIndex >= 0 && stay.destinationId === destination.id) stay.nights = Math.max(1, Math.min(stay.nights, kept.length - startIndex));
  }
  if (draft.trip.dateMode === 'fixed') {
    // Fixed dates stay fixed: released days remain in the trip, unassigned, at the end.
    for (const day of released) { day.destinationId = null; day.number += UNASSIGNED_ORDER / 2; }
    notices.push(`${plural(released.length, 'day')} freed up at the end of the trip.`);
  } else {
    draft.days = draft.days.filter((day) => !releasedIds.has(day.id));
  }
  if (moved) notices.push(`${plural(moved, 'plan')} moved to Ideas for ${destination.name}.`);
}

function dayRemove(draft: TripAggregate, operation: OperationOf<'day.remove'>, notices: string[]) {
  const day = find(draft.days, operation.dayId, 'Day');
  if (draft.days.length <= 1) throw new OperationError('A trip needs at least one day.');
  const moved = moveDayActivitiesToIdeas(draft, new Set([day.id]));
  const ordered = [...draft.days].sort((a, b) => a.number - b.number);
  const next = ordered[ordered.indexOf(day) + 1] ?? ordered[ordered.indexOf(day) - 1];
  for (const stay of draft.stays) {
    if (stay.startDayId === day.id) stay.startDayId = next?.id ?? null;
  }
  draft.days = draft.days.filter((candidate) => candidate.id !== day.id);
  if (moved) notices.push(`${plural(moved, 'plan')} moved to Ideas.`);
}

function siblings(draft: TripAggregate, dayId: string | null, excludeId?: string): Activity[] {
  return draft.activities
    .filter((activity) => activity.dayId === dayId && activity.id !== excludeId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function activityAdd(draft: TripAggregate, operation: OperationOf<'activity.add'>) {
  const input = operation.activity;
  if (draft.activities.some((activity) => activity.id === input.id)) throw new OperationError('That plan already exists.');
  assertRefs(draft, { dayId: input.dayId, destinationId: input.destinationId });
  if (input.kind === 'transport' && !input.transport) throw new OperationError('Transport needs an origin and a destination.');
  const list = siblings(draft, input.dayId);
  const index = Math.min(operation.index ?? list.length, list.length);
  list.forEach((activity, position) => { activity.sortOrder = position < index ? position : position + 1; });
  draft.activities.push({ ...input, sortOrder: index });
}

function activityUpdate(draft: TripAggregate, operation: OperationOf<'activity.update'>) {
  const activity = find(draft.activities, operation.activityId, 'Activity');
  assertRefs(draft, { destinationId: operation.patch.destinationId ?? null });
  const next = { ...activity, ...operation.patch };
  if (next.kind === 'transport' && !next.transport) throw new OperationError('Transport needs an origin and a destination.');
  Object.assign(activity, operation.patch);
}

function activityMove(draft: TripAggregate, operation: OperationOf<'activity.move'>) {
  const activity = find(draft.activities, operation.activityId, 'Activity');
  assertRefs(draft, { dayId: operation.dayId });
  const list = siblings(draft, operation.dayId, activity.id);
  const index = Math.min(operation.index, list.length);
  list.splice(index, 0, activity);
  if (operation.dayId === null && activity.dayId) {
    activity.destinationId = draft.days.find((day) => day.id === activity.dayId)?.destinationId ?? activity.destinationId;
  }
  activity.dayId = operation.dayId;
  list.forEach((item, position) => { item.sortOrder = position; });
}

function resetBooking<T extends { bookingStatus: Activity['bookingStatus']; bookingReference: string | null }>(item: T): T {
  // Reused plans never carry over a confirmed booking: the user re-books for the new trip.
  return { ...item, bookingStatus: item.bookingStatus === 'booked' ? 'planned' : item.bookingStatus, bookingReference: null };
}

function sectionInsert(draft: TripAggregate, operation: OperationOf<'section.insert'>, notices: string[]) {
  const section: SectionPayload = operation.section;
  const index = Math.min(operation.index, draft.destinations.length);
  const ordered = [...draft.destinations].sort((a, b) => a.sortOrder - b.sortOrder);
  ordered.forEach((destination, position) => { destination.sortOrder = position < index ? position : position + section.destinations.length; });
  assertDayLimit(draft, section.days.length);
  const destinationIds = section.destinations.map((destination, position) => {
    const id = `${operation.id}:dest:${position}`;
    draft.destinations.push({
      ...destination,
      id,
      color: destination.color ?? DESTINATION_COLORS[(draft.destinations.length) % DESTINATION_COLORS.length],
      sortOrder: index + position,
      startDay: null,
      endDay: null,
    });
    return id;
  });
  const dayIds = section.days.map((day, position) => {
    const destinationId = destinationIds[day.destinationIndex];
    if (!destinationId) throw new OperationError('The section refers to a destination it does not contain.');
    const id = `${operation.id}:day:${position}`;
    draft.days.push({ id, number: position + 1, date: null, destinationId, title: day.title, notes: day.notes });
    day.activities.forEach((activity, order) => {
      draft.activities.push({ ...resetBooking(activity), id: `${operation.id}:act:${position}:${order}`, dayId: id, destinationId, sortOrder: order });
    });
    return id;
  });
  (section.stays ?? []).forEach((stay, position) => {
    const startDayId = dayIds[stay.startDayIndex];
    if (!startDayId) throw new OperationError('The section has a stay outside its days.');
    const { startDayIndex: _startDayIndex, ...fields } = stay;
    void _startDayIndex;
    const destinationId = draft.days.find((day) => day.id === startDayId)?.destinationId ?? null;
    draft.stays.push({ ...resetBooking(fields as Omit<Stay, 'id' | 'startDayId' | 'destinationId'> & { bookingReference: string | null }), id: `${operation.id}:stay:${position}`, startDayId, destinationId } as Stay);
  });
  notices.push(`Added “${section.name}” — ${plural(section.days.length, 'day')}.`);
}

function restore(draft: TripAggregate, operation: OperationOf<'restore'>, context: ApplyContext) {
  if (operation.trip) tripUpdate(draft, { id: operation.id, type: 'trip.update', patch: operation.trip }, context);
  if (operation.dates) { draft.trip.dateMode = operation.dates.dateMode; draft.trip.startDate = operation.dates.startDate; }
  const remove = operation.remove ?? {};
  const drop = <T extends { id: string }>(items: T[], ids?: string[]) => (ids?.length ? items.filter((item) => !ids.includes(item.id)) : items);
  draft.destinations = drop(draft.destinations, remove.destinations);
  draft.days = drop(draft.days, remove.days);
  draft.activities = drop(draft.activities, remove.activities);
  draft.stays = drop(draft.stays, remove.stays);
  draft.expenses = drop(draft.expenses, remove.expenses);
  if (remove.rates?.length) draft.rates = draft.rates.filter((rate) => !remove.rates!.includes(rate.currency));
  const put = operation.put ?? {};
  const upsert = <T extends { id: string }>(items: T[], values?: T[]) => {
    if (!values?.length) return items;
    const byId = new Map(items.map((item) => [item.id, item]));
    for (const value of values) byId.set(value.id, { ...value });
    return [...byId.values()];
  };
  draft.destinations = upsert(draft.destinations, put.destinations);
  draft.days = upsert(draft.days, put.days);
  draft.activities = upsert(draft.activities, put.activities as Activity[] | undefined);
  draft.stays = upsert(draft.stays, put.stays as Stay[] | undefined);
  draft.expenses = upsert(draft.expenses, put.expenses);
  if (put.rates?.length) draft.rates = [...draft.rates.filter((rate) => !put.rates!.some((value) => value.currency === rate.currency)), ...put.rates];
}

/**
 * Restores every invariant of the aggregate:
 * - destinations ordered 0..n−1;
 * - days grouped by destination in destination order, unassigned days last,
 *   numbered 1..N, dated from the trip start;
 * - destination day ranges derived from their days;
 * - activities ordered 0..k within each day (and within Ideas), with their
 *   destination following their day;
 * - dangling references cleared rather than left pointing at nothing.
 */
export function normalize(aggregate: TripAggregate): TripAggregate {
  const destinations = [...aggregate.destinations].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  destinations.forEach((destination, index) => { destination.sortOrder = index; });
  const destinationOrder = new Map(destinations.map((destination, index) => [destination.id, index]));

  for (const day of aggregate.days) if (day.destinationId && !destinationOrder.has(day.destinationId)) day.destinationId = null;
  const days = [...aggregate.days].sort((a, b) => {
    const groupA = a.destinationId ? destinationOrder.get(a.destinationId)! : UNASSIGNED_ORDER;
    const groupB = b.destinationId ? destinationOrder.get(b.destinationId)! : UNASSIGNED_ORDER;
    return groupA - groupB || a.number - b.number || a.id.localeCompare(b.id);
  });
  const startDate = aggregate.trip.dateMode === 'fixed' ? aggregate.trip.startDate : null;
  days.forEach((day, index) => { day.number = index + 1; day.date = dayDate(startDate, day.number); });
  const dayById = new Map(days.map((day) => [day.id, day]));

  for (const destination of destinations) {
    const own = days.filter((day) => day.destinationId === destination.id);
    destination.startDay = own.length ? own[0].number : null;
    destination.endDay = own.length ? own[own.length - 1].number : null;
  }

  for (const activity of aggregate.activities) {
    if (activity.dayId && !dayById.has(activity.dayId)) activity.dayId = null;
    if (activity.dayId) activity.destinationId = dayById.get(activity.dayId)!.destinationId;
    if (activity.destinationId && !destinationOrder.has(activity.destinationId)) activity.destinationId = null;
    if (activity.kind !== 'transport') activity.transport = null;
  }
  const groups = new Map<string, Activity[]>();
  for (const activity of aggregate.activities) {
    const key = activity.dayId ?? '__ideas__';
    groups.set(key, [...(groups.get(key) ?? []), activity]);
  }
  const activities: Activity[] = [];
  for (const day of [...days.map((day) => day.id), '__ideas__']) {
    const list = (groups.get(day) ?? []).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    list.forEach((activity, index) => { activity.sortOrder = index; activities.push(activity); });
  }

  for (const stay of aggregate.stays) {
    if (stay.startDayId && !dayById.has(stay.startDayId)) stay.startDayId = null;
    if (stay.destinationId && !destinationOrder.has(stay.destinationId)) stay.destinationId = null;
    stay.nights = Math.max(1, Math.round(stay.nights));
  }
  const ownerIds = new Set([...activities.map((activity) => activity.id), ...aggregate.stays.map((stay) => stay.id)]);
  for (const expense of aggregate.expenses) {
    if (expense.dayId && !dayById.has(expense.dayId)) expense.dayId = null;
    if (expense.activityId && !ownerIds.has(expense.activityId)) expense.activityId = null;
  }
  const seenRates = new Set<string>();
  const rates = aggregate.rates.filter((rate) => {
    if (rate.currency === aggregate.trip.currency || seenRates.has(rate.currency)) return false;
    seenRates.add(rate.currency);
    return true;
  }).sort((a, b) => a.currency.localeCompare(b.currency));
  const stayIds = new Set(aggregate.stays.map((stay) => stay.id));
  for (const attachment of aggregate.attachments) {
    if (attachment.activityId && !ownerIds.has(attachment.activityId)) attachment.activityId = null;
    if (attachment.stayId && !stayIds.has(attachment.stayId)) attachment.stayId = null;
  }

  return {
    ...aggregate,
    trip: { ...aggregate.trip, dayCount: days.length },
    destinations,
    days,
    activities,
    stays: [...aggregate.stays].sort((a, b) => (dayById.get(a.startDayId ?? '')?.number ?? UNASSIGNED_ORDER) - (dayById.get(b.startDayId ?? '')?.number ?? UNASSIGNED_ORDER) || a.id.localeCompare(b.id)),
    expenses: aggregate.expenses,
    rates,
  };
}
