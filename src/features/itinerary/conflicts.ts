import { journeyMinutes, timeToMinutes } from '@/lib/dates';
import { distanceKm } from '@/lib/geo';
import { activitiesForDay, connections, stayNights } from '@/features/trips/selectors';
import type { Activity, TripAggregate } from '@/features/trips/types';

// Rule-based schedule checks. Each warning states what is known and how
// certain it is: `conflict` means the entered data contradicts itself;
// `warning` means something is likely wrong; `info` is a gentle prompt.
// Nothing here invents travel times or opening hours.

export type WarningLevel = 'conflict' | 'warning' | 'info';
export type ScheduleWarning = {
  id: string;
  level: WarningLevel;
  kind: 'overlap' | 'transport-arrival' | 'tight-gap' | 'busy-day' | 'stay-overlap' | 'missing-stay' | 'missing-transport' | 'empty-destination';
  message: string;
  dayId: string | null;
  itemIds: string[];
};

const BUSY_DAY_MINUTES = 11 * 60;
const BUSY_DAY_ITEMS = 8;
/** Straight-line speed above which a gap is flagged; well above city travel speeds. */
const IMPLAUSIBLE_KMH = 40;

function start(activity: Activity): number | null {
  if (activity.kind === 'transport') return timeToMinutes(activity.transport?.departTime);
  return timeToMinutes(activity.startTime);
}

/** End in the same day's local minutes, or null when unknown or it ends on another day. */
function end(activity: Activity, date: string | null): number | null {
  const begin = start(activity);
  if (begin === null) return null;
  if (activity.kind === 'transport' && activity.transport) {
    if (activity.transport.arriveDayOffset > 0) return null;
    const minutes = journeyMinutes({ departDate: date, ...activity.transport });
    return minutes === null ? null : begin + minutes;
  }
  return activity.durationMinutes ? begin + activity.durationMinutes : null;
}

function located(activity: Activity): { lat: number; lng: number } | null {
  if (activity.kind === 'transport') return null;
  const lat = activity.place?.lat;
  const lng = activity.place?.lng;
  return typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null;
}

export function scheduleWarnings(aggregate: TripAggregate): ScheduleWarning[] {
  const warnings: ScheduleWarning[] = [];
  const push = (warning: Omit<ScheduleWarning, 'id'>) => warnings.push({ ...warning, id: `${warning.kind}:${warning.itemIds.join('+') || warning.dayId}` });

  for (const day of aggregate.days) {
    const items = activitiesForDay(aggregate, day.id).filter((activity) => activity.bookingStatus !== 'cancelled' && activity.kind !== 'note');
    const timed = items.filter((activity) => start(activity) !== null).sort((a, b) => start(a)! - start(b)!);

    for (let index = 1; index < timed.length; index += 1) {
      const previous = timed[index - 1];
      const current = timed[index];
      const previousEnd = end(previous, day.date);
      const currentStart = start(current)!;
      if (previousEnd !== null && previousEnd > currentStart) {
        if (previous.kind === 'transport') {
          push({ level: 'conflict', kind: 'transport-arrival', dayId: day.id, itemIds: [previous.id, current.id], message: `${previous.title} arrives after ${current.title} is due to start.` });
        } else {
          push({ level: 'conflict', kind: 'overlap', dayId: day.id, itemIds: [previous.id, current.id], message: `${previous.title} runs into ${current.title}.` });
        }
        continue;
      }
      const from = located(previous);
      const to = located(current);
      const gapStart = previousEnd ?? start(previous)!;
      const gap = currentStart - gapStart;
      if (from && to && previousEnd !== null && gap >= 0) {
        const km = distanceKm(from, to);
        if (km > 1 && (gap === 0 || km / (gap / 60) > IMPLAUSIBLE_KMH)) {
          push({ level: 'warning', kind: 'tight-gap', dayId: day.id, itemIds: [previous.id, current.id], message: `${previous.title} and ${current.title} are ${km.toFixed(km < 10 ? 1 : 0)} km apart in a straight line, with ${gap} min between them.` });
        }
      }
    }

    const scheduledMinutes = timed.reduce((sum, activity) => sum + (activity.kind === 'place' ? activity.durationMinutes ?? 0 : 0), 0);
    if (items.length >= BUSY_DAY_ITEMS || scheduledMinutes >= BUSY_DAY_MINUTES) {
      push({ level: 'info', kind: 'busy-day', dayId: day.id, itemIds: [], message: `Day ${day.number} is packed — ${items.length} plans${scheduledMinutes ? `, ${Math.round(scheduledMinutes / 60)} h scheduled` : ''}. Consider moving something to another day.` });
    }
  }

  const nights = stayNights(aggregate);
  for (const [dayId, list] of nights) {
    if (list.length > 1) {
      const day = aggregate.days.find((candidate) => candidate.id === dayId)!;
      push({ level: 'conflict', kind: 'stay-overlap', dayId, itemIds: list.map((entry) => entry.stay.id), message: `Two stays booked for the night of day ${day.number}: ${list.map((entry) => entry.stay.name).join(' and ')}.` });
    }
  }

  if (aggregate.stays.length) {
    const uncovered = aggregate.days.slice(0, -1).filter((day) => !nights.has(day.id));
    if (uncovered.length) {
      push({ level: 'info', kind: 'missing-stay', dayId: null, itemIds: [], message: `No accommodation yet for ${uncovered.length === 1 ? `the night of day ${uncovered[0].number}` : `${uncovered.length} nights (days ${compactRanges(uncovered.map((day) => day.number))})`}. Fine if you are on an overnight journey or staying with friends.` });
    }
  }

  for (const link of connections(aggregate)) {
    if (!link.transport.length && link.from.name !== link.to.name) {
      push({ level: 'info', kind: 'missing-transport', dayId: link.firstDay?.id ?? null, itemIds: [link.from.id, link.to.id], message: `How will you get from ${link.from.name} to ${link.to.name}?` });
    }
  }

  for (const destination of aggregate.destinations) {
    if (destination.startDay === null) push({ level: 'warning', kind: 'empty-destination', dayId: null, itemIds: [destination.id], message: `${destination.name} has no days allocated.` });
  }

  return warnings;
}

/** [1,2,3,5,7,8] → "1–3, 5, 7–8" */
export function compactRanges(numbers: number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const first = sorted[index];
    while (sorted[index + 1] === sorted[index] + 1) index += 1;
    parts.push(first === sorted[index] ? `${first}` : `${first}–${sorted[index]}`);
  }
  return parts.join(', ');
}
