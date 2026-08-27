import type { ItineraryEvent, TripDay } from './types';

export function dayTotal(day: TripDay): number {
  return day.events.reduce((sum, event) => sum + (event.actualCost ?? event.estimatedCost), 0);
}

export function tripTotal(days: TripDay[]): number {
  return days.reduce((sum, day) => sum + dayTotal(day), 0);
}

export function categoryTotals(days: TripDay[]): Record<string, number> {
  return days.flatMap((day) => day.events).reduce<Record<string, number>>((totals, event) => {
    totals[event.category] = (totals[event.category] ?? 0) + (event.actualCost ?? event.estimatedCost);
    return totals;
  }, {});
}

export function dayCategoryTotals(day: TripDay): Record<string, number> {
  return day.events.reduce<Record<string, number>>((totals, event) => {
    totals[event.category] = (totals[event.category] ?? 0) + (event.actualCost ?? event.estimatedCost);
    return totals;
  }, {});
}

export function convertAmount(amount: number, rate: number): number {
  if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate <= 0) throw new Error('A positive amount and exchange rate are required.');
  return Math.round(amount * rate * 100) / 100;
}

export function reorderEvents(events: ItineraryEvent[], activeId: string, overId: string): ItineraryEvent[] {
  const from = events.findIndex((event) => event.id === activeId);
  const to = events.findIndex((event) => event.id === overId);
  if (from < 0 || to < 0 || from === to) return events;
  const next = [...events];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((event, sortOrder) => ({ ...event, sortOrder }));
}

export function bookingTransitionAllowed(from: string, to: string): boolean {
  const terminal = new Set(['Cancelled']);
  if (terminal.has(from)) return to === 'Researching';
  return from !== to;
}

export function generateDays(startDate: string, endDate: string): { dayNumber: number; date: string }[] {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) throw new Error('End date must be on or after start date.');
  const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  return Array.from({ length: days }, (_, index) => ({ dayNumber: index + 1, date: new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10) }));
}
