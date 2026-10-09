import type { Activity, ActivityCategory, Day, Destination, Expense, PlaceRef, Stay, TransportDetails, Trip, TripAggregate } from './types';

// Default-filled constructors so callers only specify what matters.

export function makeTrip(input: Partial<Trip> & Pick<Trip, 'id' | 'name' | 'ownerId'>): Trip {
  const now = new Date().toISOString();
  return {
    dateMode: 'flexible', startDate: null, dayCount: 1, currency: 'AUD', budget: null, travellers: 1, pace: null,
    interests: [], notes: '', coverImageUrl: null, coverCredit: null, archivedAt: null, isSample: false, version: 0,
    createdAt: now, updatedAt: now,
    ...input,
  };
}

export function makeAggregate(trip: Trip, days: Day[] = []): TripAggregate {
  return { trip, destinations: [], days, activities: [], stays: [], expenses: [], rates: [], attachments: [], members: [] };
}

export function makeDay(input: Partial<Day> & Pick<Day, 'id' | 'number'>): Day {
  return { date: null, destinationId: null, title: '', notes: '', ...input };
}

export function makeDestinationInput(input: Partial<Destination> & Pick<Destination, 'id' | 'name'>): Omit<Destination, 'sortOrder' | 'startDay' | 'endDay'> {
  return {
    country: '', countryCode: null, lat: null, lng: null, timezone: null, description: null, imageUrl: null, imageCredit: null,
    color: '#2f6f57', providerId: null,
    ...input,
  };
}

export function makeActivity(input: Partial<Activity> & Pick<Activity, 'id' | 'title'>): Activity {
  return {
    dayId: null, destinationId: null, kind: 'place', category: 'sight', sortOrder: 0, timeSlot: 'anytime', startTime: null,
    durationMinutes: null, place: null, notes: '', url: null, imageUrl: null, cost: null, currency: 'AUD', bookingStatus: 'none',
    bookingReference: null, transport: null,
    ...input,
  };
}

export function makeTransport(input: Partial<TransportDetails> & { from: PlaceRef; to: PlaceRef }): TransportDetails {
  return {
    mode: 'train', departTime: null, arriveTime: null, arriveDayOffset: 0, departTimezone: null, arriveTimezone: null,
    operator: null, serviceNumber: null,
    ...input,
  };
}

export function makeStay(input: Partial<Stay> & Pick<Stay, 'id' | 'name'>): Stay {
  return {
    type: 'hotel', place: null, destinationId: null, startDayId: null, nights: 1, checkInTime: null, checkOutTime: null,
    bookingStatus: 'planned', bookingReference: null, cost: null, currency: 'AUD', phone: null, email: null, url: null, notes: '',
    ...input,
  };
}

export function makeExpense(input: Partial<Expense> & Pick<Expense, 'id' | 'title' | 'amount'>): Expense {
  return {
    category: 'other', currency: 'AUD', rate: null, rateSource: null, rateAt: null, dayId: null, activityId: null, status: 'planned',
    ...input,
  };
}

/** Maps a place-search category onto an activity category. */
export function categoryFromPlaceKind(kind: string | null | undefined): ActivityCategory {
  switch (kind) {
    case 'restaurant': case 'cafe': case 'fast_food': case 'bar': case 'pub': case 'food_court': case 'bakery': case 'marketplace':
      return kind === 'bar' || kind === 'pub' ? 'nightlife' : 'food';
    case 'park': case 'garden': case 'nature_reserve': case 'peak': case 'beach': case 'viewpoint': case 'waterfall': case 'lake':
      return 'nature';
    case 'mall': case 'department_store': case 'shop': case 'supermarket':
      return 'shopping';
    case 'museum': case 'attraction': case 'monument': case 'castle': case 'temple': case 'place_of_worship': case 'artwork': case 'gallery': case 'memorial': case 'ruins': case 'historic':
      return 'sight';
    case 'theme_park': case 'zoo': case 'aquarium': case 'theatre': case 'cinema': case 'sports_centre':
      return 'activity';
    default:
      return 'other';
  }
}
