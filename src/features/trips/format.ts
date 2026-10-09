import { daysBetween, formatDateRange, todayIso } from '@/lib/dates';
import { tripPhase, type TripPhase } from './selectors';
import type { PlanningChecklist, TripSummary } from './types';

// Human-readable descriptions shared by My Trips, the planner and exports.

export function tripDatesLabel(trip: Pick<TripSummary, 'startDate' | 'endDate' | 'dayCount' | 'dateMode'>): string {
  if (trip.dateMode === 'flexible' || !trip.startDate) return `${trip.dayCount} ${trip.dayCount === 1 ? 'day' : 'days'} · dates flexible`;
  return formatDateRange(trip.startDate, trip.endDate);
}

export function phaseOf(trip: Pick<TripSummary, 'startDate' | 'endDate' | 'dateMode'>): TripPhase {
  return trip.dateMode === 'fixed' ? tripPhase(trip.startDate, trip.endDate) : 'planning';
}

export function phaseLabel(trip: Pick<TripSummary, 'startDate' | 'endDate' | 'dateMode'>, today = todayIso()): { label: string; tone: 'primary' | 'accent' | 'neutral' | 'info' } {
  const phase = phaseOf(trip);
  if (phase === 'travelling' && trip.startDate) return { label: `Travelling · day ${daysBetween(trip.startDate, today) + 1}`, tone: 'accent' };
  if (phase === 'upcoming' && trip.startDate) {
    const days = daysBetween(today, trip.startDate);
    return { label: days === 1 ? 'Starts tomorrow' : days < 60 ? `In ${days} days` : `In ${Math.round(days / 30.4)} months`, tone: 'primary' };
  }
  if (phase === 'past') return { label: 'Completed', tone: 'neutral' };
  return { label: 'Planning', tone: 'info' };
}

/** Short planning-progress facts. Only criteria that mean something, never an arbitrary percentage. */
export function checklistItems(checklist: PlanningChecklist): { label: string; done: boolean }[] {
  const items: { label: string; done: boolean }[] = [];
  if (!checklist.hasDestinations) return [{ label: 'No destinations yet', done: false }];
  if (checklist.nightsTotal > 0) items.push({ label: `Stays ${checklist.nightsCovered}/${checklist.nightsTotal} nights`, done: checklist.nightsCovered >= checklist.nightsTotal });
  if (checklist.connectionsTotal > 0) items.push({ label: `Transport ${checklist.connectionsCovered}/${checklist.connectionsTotal}`, done: checklist.connectionsCovered >= checklist.connectionsTotal });
  if (!checklist.hasDates) items.push({ label: 'Dates not set', done: false });
  return items;
}

export function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join('');
}
