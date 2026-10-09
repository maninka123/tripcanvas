import { addDays, timeToMinutes, todayIso, tripEndDate } from '@/lib/dates';
import type { Activity, Day, Destination, PlanningChecklist, Stay, TimeSlot, TripAggregate } from './types';

// Read-only views derived from the aggregate. Components never compute
// these inline, so the itinerary, map, budget and travel mode always agree.

export function tripEnd(aggregate: TripAggregate): string | null {
  return tripEndDate(aggregate.trip.dateMode === 'fixed' ? aggregate.trip.startDate : null, aggregate.days.length);
}

export function orderedDestinations(aggregate: TripAggregate): Destination[] {
  return [...aggregate.destinations].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function destinationById(aggregate: TripAggregate, id: string | null | undefined): Destination | null {
  return id ? aggregate.destinations.find((destination) => destination.id === id) ?? null : null;
}

const SLOT_MINUTES: Record<TimeSlot, number> = { morning: 9 * 60, afternoon: 14 * 60, evening: 19 * 60, anytime: 24 * 60 };

/** Minutes used to place an activity chronologically: exact time first, then its time-of-day slot. */
export function activityStartMinutes(activity: Activity): number | null {
  if (activity.kind === 'transport' && activity.transport?.departTime) return timeToMinutes(activity.transport.departTime);
  return timeToMinutes(activity.startTime);
}

export function activitiesForDay(aggregate: TripAggregate, dayId: string): Activity[] {
  return aggregate.activities.filter((activity) => activity.dayId === dayId).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function ideas(aggregate: TripAggregate): Activity[] {
  return aggregate.activities.filter((activity) => activity.dayId === null).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Sort key that respects the user's manual order but keeps clearly timed items chronological. */
export function slotMinutes(activity: Activity): number {
  return activityStartMinutes(activity) ?? SLOT_MINUTES[activity.timeSlot];
}

export type StayNight = { stay: Stay; night: number; nights: number; isCheckIn: boolean };

/** For each day id, the stay whose night it is (the night *after* that day). */
export function stayNights(aggregate: TripAggregate): Map<string, StayNight[]> {
  const result = new Map<string, StayNight[]>();
  const byNumber = new Map(aggregate.days.map((day) => [day.number, day]));
  for (const stay of aggregate.stays) {
    if (stay.bookingStatus === 'cancelled') continue;
    const start = aggregate.days.find((day) => day.id === stay.startDayId);
    if (!start) continue;
    for (let night = 0; night < stay.nights; night += 1) {
      const day = byNumber.get(start.number + night);
      if (!day) break;
      result.set(day.id, [...(result.get(day.id) ?? []), { stay, night: night + 1, nights: stay.nights, isCheckIn: night === 0 }]);
    }
  }
  return result;
}

/** Stays whose check-out falls on the given day. */
export function checkOutsByDay(aggregate: TripAggregate): Map<string, Stay[]> {
  const result = new Map<string, Stay[]>();
  const byNumber = new Map(aggregate.days.map((day) => [day.number, day]));
  for (const stay of aggregate.stays) {
    if (stay.bookingStatus === 'cancelled') continue;
    const start = aggregate.days.find((day) => day.id === stay.startDayId);
    const out = start ? byNumber.get(start.number + stay.nights) : undefined;
    if (out) result.set(out.id, [...(result.get(out.id) ?? []), stay]);
  }
  return result;
}

export type Connection = { from: Destination; to: Destination; firstDay: Day | null; transport: Activity[] };

/** Each change of destination, with the transport that links them (if any). */
export function connections(aggregate: TripAggregate): Connection[] {
  const ordered = orderedDestinations(aggregate).filter((destination) => destination.startDay !== null);
  const result: Connection[] = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const from = ordered[index - 1];
    const to = ordered[index];
    const firstDay = aggregate.days.find((day) => day.number === to.startDay) ?? null;
    const window = new Set(aggregate.days.filter((day) => day.number === from.endDay || day.number === to.startDay).map((day) => day.id));
    const transport = aggregate.activities.filter((activity) => activity.kind === 'transport' && activity.dayId && window.has(activity.dayId) && activity.bookingStatus !== 'cancelled');
    result.push({ from, to, firstDay, transport });
  }
  return result;
}

export function planningChecklist(aggregate: TripAggregate): PlanningChecklist {
  const nights = stayNights(aggregate);
  const nightsTotal = Math.max(0, aggregate.days.length - 1);
  const nightsCovered = aggregate.days.slice(0, nightsTotal).filter((day) => nights.has(day.id)).length;
  const links = connections(aggregate);
  return {
    hasDates: aggregate.trip.dateMode === 'fixed' && !!aggregate.trip.startDate,
    hasDestinations: aggregate.destinations.length > 0,
    nightsCovered,
    nightsTotal,
    connectionsCovered: links.filter((link) => link.transport.length > 0).length,
    connectionsTotal: links.length,
    daysPlanned: aggregate.days.filter((day) => aggregate.activities.some((activity) => activity.dayId === day.id)).length,
  };
}

export type TripPhase = 'planning' | 'upcoming' | 'travelling' | 'past';

export function tripPhase(startDate: string | null, endDate: string | null, today = todayIso()): TripPhase {
  if (!startDate || !endDate) return 'planning';
  if (today > endDate) return 'past';
  if (today >= startDate) return 'travelling';
  return 'upcoming';
}

/** The day Travel Mode should open on: today when travelling, otherwise the first day. */
export function travelDay(aggregate: TripAggregate, today = todayIso()): { day: Day | null; isToday: boolean } {
  const match = aggregate.days.find((day) => day.date === today);
  if (match) return { day: match, isToday: true };
  return { day: aggregate.days[0] ?? null, isToday: false };
}

export function nextDayDate(date: string | null): string | null {
  return date ? addDays(date, 1) : null;
}

export function attachmentsFor(aggregate: TripAggregate, owner: { activityId?: string; stayId?: string }) {
  return aggregate.attachments.filter((attachment) => (owner.activityId && attachment.activityId === owner.activityId) || (owner.stayId && attachment.stayId === owner.stayId));
}

/** Located points of a day in itinerary order: stay of the previous night, activities, tonight's stay. */
export function dayPoints(aggregate: TripAggregate, dayId: string): { id: string; label: string; lat: number; lng: number; kind: 'activity' | 'stay' }[] {
  const located = activitiesForDay(aggregate, dayId)
    .filter((activity) => activity.kind === 'place' && typeof activity.place?.lat === 'number' && typeof activity.place?.lng === 'number')
    .map((activity) => ({ id: activity.id, label: activity.title, lat: activity.place!.lat!, lng: activity.place!.lng!, kind: 'activity' as const }));
  return located;
}
