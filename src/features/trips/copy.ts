import { newOp, type Operation } from './operations';
import type { TripAggregate } from './types';

// Copies a trip's plan into a single `restore` operation with fresh ids.
// Used to duplicate a trip and to create the sample trip. Files and
// sharing are not copied; confirmed bookings become "planned" because a
// booking reference belongs to one real reservation.

export function copyOperation(source: TripAggregate, options: { resetBookings?: boolean; newId?: () => string } = {}): Operation {
  const newId = options.newId ?? (() => crypto.randomUUID());
  const ids = new Map<string, string>();
  const map = (id: string | null) => {
    if (!id) return null;
    if (!ids.has(id)) ids.set(id, newId());
    return ids.get(id)!;
  };
  const reset = <T extends { bookingStatus: string; bookingReference: string | null }>(item: T): T =>
    options.resetBookings === false ? item : { ...item, bookingStatus: item.bookingStatus === 'booked' ? 'planned' : item.bookingStatus, bookingReference: null };
  const { trip } = source;
  return newOp({
    type: 'restore',
    // The name is chosen by the caller (e.g. "… (copy)").
    trip: { currency: trip.currency, budget: trip.budget, travellers: trip.travellers, pace: trip.pace, interests: trip.interests, notes: trip.notes, coverImageUrl: trip.coverImageUrl, coverCredit: trip.coverCredit },
    dates: { dateMode: trip.dateMode, startDate: trip.startDate },
    put: {
      destinations: source.destinations.map((destination) => ({ ...destination, id: map(destination.id)! })),
      days: source.days.map((day) => ({ ...day, id: map(day.id)!, destinationId: map(day.destinationId) })),
      activities: source.activities.map((activity) => reset({ ...activity, id: map(activity.id)!, dayId: map(activity.dayId), destinationId: map(activity.destinationId) })),
      stays: source.stays.map((stay) => reset({ ...stay, id: map(stay.id)!, startDayId: map(stay.startDayId), destinationId: map(stay.destinationId) })),
      expenses: source.expenses.map((expense) => ({ ...expense, id: map(expense.id)!, dayId: map(expense.dayId), activityId: map(expense.activityId) })),
      rates: source.rates,
    },
  } as Parameters<typeof newOp>[0]);
}
