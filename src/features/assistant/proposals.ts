import { makeActivity, makeStay, makeTransport } from '@/features/trips/factory';
import { newOp, operationSchema, type Operation } from '@/features/trips/operations';
import { applyOperations, OperationError } from '@/features/trips/reducer';
import type { PlaceRef, TripAggregate } from '@/features/trips/types';
import { isTime } from '@/lib/dates';
import type { AssistantChange } from '@/services/travel-assistant';

// Turns assistant proposals into ordinary, validated trip operations.
// Each proposal is checked on its own against the current trip so the
// traveller can accept any subset; anything invalid is reported, not applied.

export type Geocode = (name: string, near: { lat: number; lng: number } | null) => Promise<PlaceRef | null>;

export type ReviewedChange = {
  id: string;
  description: string;
  action: AssistantChange['action'];
  operations: Operation[];
  /** Day numbers this change touches, for the review list. */
  affectedDays: number[];
  /** Notes for the traveller (unverified location, estimated cost…). */
  caveats: string[];
  destructive: boolean;
  error: string | null;
};

const clampText = (value: string | null | undefined, max: number) => (value ?? '').trim().slice(0, max);

export async function reviewChanges(aggregate: TripAggregate, changes: AssistantChange[], geocode: Geocode, now: string): Promise<ReviewedChange[]> {
  const reviewed: ReviewedChange[] = [];
  for (const change of changes.slice(0, 40)) {
    const caveats: string[] = [];
    let operations: Operation[] = [];
    let error: string | null = null;
    try {
      operations = await toOperations(aggregate, change, geocode, caveats);
      operations = operations.map((operation) => operationSchema.parse(operation));
      applyOperations(aggregate, operations, { now });
    } catch (cause) {
      error = cause instanceof OperationError ? cause.message : cause instanceof Error && cause.name !== 'ZodError' ? cause.message : 'This change is not valid for the current trip.';
      operations = [];
    }
    reviewed.push({
      id: crypto.randomUUID(),
      description: clampText(change.description, 240) || change.action.replaceAll('_', ' '),
      action: change.action,
      operations,
      affectedDays: affectedDays(aggregate, change),
      caveats,
      destructive: change.action.startsWith('remove_') || change.action === 'set_destination_days',
      error,
    });
  }
  return reviewed;
}

function affectedDays(aggregate: TripAggregate, change: AssistantChange): number[] {
  const days = new Set<number>();
  if (change.dayNumber) days.add(change.dayNumber);
  const activity = aggregate.activities.find((item) => item.id === change.activityId);
  const day = aggregate.days.find((item) => item.id === activity?.dayId);
  if (day) days.add(day.number);
  const destination = aggregate.destinations.find((item) => item.id === change.destinationId);
  if (destination?.startDay && destination.endDay) for (let number = destination.startDay; number <= destination.endDay; number += 1) days.add(number);
  return [...days].sort((a, b) => a - b);
}

function dayIdFor(aggregate: TripAggregate, dayNumber: number | null): string | null {
  if (dayNumber === null) return null;
  const day = aggregate.days.find((item) => item.number === dayNumber);
  if (!day) throw new OperationError(`Day ${dayNumber} is not part of this trip.`);
  return day.id;
}

function nearFor(aggregate: TripAggregate, dayId: string | null, destinationId: string | null): { lat: number; lng: number } | null {
  const id = destinationId ?? aggregate.days.find((day) => day.id === dayId)?.destinationId ?? null;
  const destination = aggregate.destinations.find((item) => item.id === id);
  return destination && typeof destination.lat === 'number' && typeof destination.lng === 'number' ? { lat: destination.lat, lng: destination.lng } : null;
}

async function toOperations(aggregate: TripAggregate, change: AssistantChange, geocode: Geocode, caveats: string[]): Promise<Operation[]> {
  const currency = aggregate.trip.currency;
  const cost = change.estimatedCost !== null && change.estimatedCost >= 0 ? Math.round(change.estimatedCost) : null;
  if (cost !== null) caveats.push('Cost is a rough estimate from the assistant.');
  const startTime = change.startTime && isTime(change.startTime) ? change.startTime : null;

  switch (change.action) {
    case 'add_place':
    case 'add_note': {
      const dayId = dayIdFor(aggregate, change.dayNumber);
      const near = nearFor(aggregate, dayId, change.destinationId);
      let place: PlaceRef | null = null;
      if (change.action === 'add_place' && change.placeName) {
        place = await geocode(change.placeName, near);
        if (!place) { place = { name: clampText(change.placeName, 200), address: null, lat: null, lng: null, providerId: null }; caveats.push('Location could not be verified on the map.'); }
      }
      return [newOp({
        type: 'activity.add',
        index: change.position ?? undefined,
        activity: makeActivity({
          id: crypto.randomUUID(),
          title: clampText(change.title ?? change.placeName, 200) || 'New plan',
          kind: change.action === 'add_note' ? 'note' : 'place',
          category: change.category ?? 'sight',
          dayId,
          destinationId: dayId ? null : change.destinationId,
          timeSlot: change.timeSlot ?? 'anytime',
          startTime,
          durationMinutes: change.durationMinutes && change.durationMinutes > 0 ? Math.min(change.durationMinutes, 1440) : null,
          place,
          notes: clampText(change.notes, 2000),
          cost,
          currency,
          bookingStatus: 'none',
        }),
      })];
    }
    case 'move_activity': {
      if (!change.activityId) throw new OperationError('No activity was named.');
      return [newOp({ type: 'activity.move', activityId: change.activityId, dayId: dayIdFor(aggregate, change.dayNumber), index: change.position ?? 999 })];
    }
    case 'update_activity': {
      if (!change.activityId) throw new OperationError('No activity was named.');
      const current = aggregate.activities.find((activity) => activity.id === change.activityId);
      if (current?.bookingStatus === 'booked') caveats.push('This plan is marked as booked — check your booking before changing it.');
      const patch: Record<string, unknown> = {};
      if (change.title) patch.title = clampText(change.title, 200);
      if (change.timeSlot) patch.timeSlot = change.timeSlot;
      if (change.startTime !== null) patch.startTime = startTime;
      if (change.durationMinutes) patch.durationMinutes = Math.min(change.durationMinutes, 1440);
      if (change.notes) patch.notes = clampText(change.notes, 5000);
      if (cost !== null) patch.cost = cost;
      const operations: Operation[] = [newOp({ type: 'activity.update', activityId: change.activityId, patch })];
      if (change.dayNumber !== null && current) operations.push(newOp({ type: 'activity.move', activityId: change.activityId, dayId: dayIdFor(aggregate, change.dayNumber), index: change.position ?? 999 }));
      return operations;
    }
    case 'remove_activity': {
      if (!change.activityId) throw new OperationError('No activity was named.');
      const current = aggregate.activities.find((activity) => activity.id === change.activityId);
      if (current?.bookingStatus === 'booked') throw new OperationError('This plan is booked. Remove it yourself if you really mean to.');
      return [newOp({ type: 'activity.remove', activityId: change.activityId })];
    }
    case 'add_destination': {
      const name = clampText(change.destinationName, 120);
      if (!name) throw new OperationError('No destination was named.');
      const located = await geocode(`${name}${change.country ? `, ${change.country}` : ''}`, null);
      if (!located) caveats.push('Destination could not be located on the map.');
      return [newOp({
        type: 'destination.add',
        index: change.toIndex ?? undefined,
        dayCount: Math.max(1, Math.min(change.dayCount ?? 1, 30)),
        destination: { id: crypto.randomUUID(), name, country: clampText(change.country, 80), countryCode: null, lat: located?.lat ?? null, lng: located?.lng ?? null, timezone: null, description: null, imageUrl: null, imageCredit: null, providerId: located?.providerId ?? null },
      })];
    }
    case 'set_destination_days': {
      if (!change.destinationId || change.dayCount === null) throw new OperationError('No destination or day count was given.');
      return [newOp({ type: 'destination.setDays', destinationId: change.destinationId, dayCount: Math.max(0, Math.min(change.dayCount, 60)) })];
    }
    case 'move_destination': {
      if (!change.destinationId || change.toIndex === null) throw new OperationError('No destination or position was given.');
      return [newOp({ type: 'destination.move', destinationId: change.destinationId, toIndex: Math.max(0, change.toIndex) })];
    }
    case 'remove_destination': {
      if (!change.destinationId) throw new OperationError('No destination was named.');
      return [newOp({ type: 'destination.remove', destinationId: change.destinationId })];
    }
    case 'add_transport': {
      const dayId = dayIdFor(aggregate, change.dayNumber);
      if (!change.fromName || !change.toName) throw new OperationError('Transport needs a start and an end.');
      caveats.push('Check current schedules and prices before booking.');
      return [newOp({
        type: 'activity.add',
        index: change.position ?? 0,
        activity: makeActivity({
          id: crypto.randomUUID(),
          title: clampText(change.title, 200) || `${clampText(change.fromName, 80)} → ${clampText(change.toName, 80)}`,
          kind: 'transport', category: 'other', dayId, cost, currency, bookingStatus: 'idea', notes: clampText(change.notes, 2000),
          transport: makeTransport({ mode: change.transportMode ?? 'other', from: { name: clampText(change.fromName, 200) }, to: { name: clampText(change.toName, 200) } }),
        }),
      })];
    }
    case 'add_stay': {
      const dayId = dayIdFor(aggregate, change.dayNumber);
      const name = clampText(change.stayName ?? change.placeName, 200);
      if (!name) throw new OperationError('No accommodation was named.');
      const place = await geocode(change.placeName ?? name, nearFor(aggregate, dayId, change.destinationId));
      if (!place) caveats.push('Location could not be verified on the map.');
      caveats.push('Not booked — check availability and prices yourself.');
      return [newOp({
        type: 'stay.add',
        stay: makeStay({ id: crypto.randomUUID(), name, startDayId: dayId, destinationId: aggregate.days.find((day) => day.id === dayId)?.destinationId ?? null, nights: Math.max(1, Math.min(change.nights ?? 1, 60)), place: place ?? { name, lat: null, lng: null }, bookingStatus: 'idea', cost, currency, notes: clampText(change.notes, 2000) }),
      })];
    }
    case 'rename_day': {
      const dayId = dayIdFor(aggregate, change.dayNumber);
      if (!dayId || !change.title) throw new OperationError('No day or title was given.');
      return [newOp({ type: 'day.update', dayId, patch: { title: clampText(change.title, 160) } })];
    }
  }
}
