// Domain model for a trip. The trip is loaded and edited as one aggregate:
// the server persists it in normalised D1 tables, and every view (itinerary,
// map, budget, bookings, travel mode) is derived from this single shape.

export type ID = string;

export type TripRole = 'owner' | 'editor' | 'viewer';
export type DateMode = 'fixed' | 'flexible';
export type Pace = 'relaxed' | 'balanced' | 'packed';

/** Where a booking stands. `none` means the item does not need a booking. */
export type BookingStatus = 'none' | 'idea' | 'planned' | 'booked' | 'cancelled';

export type ActivityKind = 'place' | 'transport' | 'note';
export type ActivityCategory = 'sight' | 'food' | 'activity' | 'nature' | 'shopping' | 'nightlife' | 'other';
export type TimeSlot = 'morning' | 'afternoon' | 'evening' | 'anytime';
export type TransportMode = 'flight' | 'train' | 'bus' | 'ferry' | 'car' | 'taxi' | 'transfer' | 'walk' | 'bike' | 'other';
export type StayType = 'hotel' | 'hostel' | 'apartment' | 'guesthouse' | 'other';
export type ExpenseCategory = 'accommodation' | 'transport' | 'food' | 'activities' | 'shopping' | 'other';
export type ExpenseStatus = 'planned' | 'paid';
export type RateSource = 'manual' | 'provider';
export type AttachmentCategory = 'ticket' | 'confirmation' | 'voucher' | 'insurance' | 'other';

/** A located point. Coordinates are optional: an activity need not have a place. */
export type PlaceRef = {
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** Provider identity (e.g. `osm:N123`) so duplicates can be detected. */
  providerId?: string | null;
};

export type Trip = {
  id: ID;
  name: string;
  ownerId: ID;
  dateMode: DateMode;
  /** ISO date (YYYY-MM-DD) for fixed trips; null while dates are flexible. */
  startDate: string | null;
  /** Number of days; kept equal to `days.length` by normalisation. */
  dayCount: number;
  currency: string;
  /** Optional trip budget in `currency`. */
  budget: number | null;
  travellers: number;
  pace: Pace | null;
  interests: string[];
  notes: string;
  coverImageUrl: string | null;
  coverCredit: string | null;
  archivedAt: string | null;
  isSample: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type Destination = {
  id: ID;
  name: string;
  country: string;
  countryCode: string | null;
  lat: number | null;
  lng: number | null;
  /** IANA zone, e.g. `Asia/Shanghai`. */
  timezone: string | null;
  sortOrder: number;
  /** Derived: first and last day number covered, null when no days are allocated. */
  startDay: number | null;
  endDay: number | null;
  description: string | null;
  imageUrl: string | null;
  imageCredit: string | null;
  color: string;
  providerId: string | null;
};

export type Day = {
  id: ID;
  number: number;
  /** ISO date for fixed-date trips, null for flexible trips. */
  date: string | null;
  destinationId: ID | null;
  title: string;
  notes: string;
};

export type TransportDetails = {
  mode: TransportMode;
  from: PlaceRef;
  to: PlaceRef;
  /** HH:mm local to `departTimezone`. */
  departTime: string | null;
  /** HH:mm local to `arriveTimezone`. */
  arriveTime: string | null;
  /** Days after the departure day that arrival happens (overnight services). */
  arriveDayOffset: number;
  departTimezone: string | null;
  arriveTimezone: string | null;
  operator: string | null;
  serviceNumber: string | null;
};

export type Activity = {
  id: ID;
  /** null = an unscheduled idea. */
  dayId: ID | null;
  /** Destination the activity belongs to; kept in sync with the day, and used to group ideas. */
  destinationId: ID | null;
  kind: ActivityKind;
  category: ActivityCategory;
  title: string;
  sortOrder: number;
  timeSlot: TimeSlot;
  /** HH:mm, or null for flexible timing. */
  startTime: string | null;
  durationMinutes: number | null;
  place: PlaceRef | null;
  notes: string;
  url: string | null;
  imageUrl: string | null;
  cost: number | null;
  currency: string;
  bookingStatus: BookingStatus;
  bookingReference: string | null;
  transport: TransportDetails | null;
};

export type Stay = {
  id: ID;
  name: string;
  type: StayType;
  place: PlaceRef | null;
  destinationId: ID | null;
  /** Day on which the traveller checks in; the stay covers `nights` consecutive nights. */
  startDayId: ID | null;
  nights: number;
  checkInTime: string | null;
  checkOutTime: string | null;
  bookingStatus: BookingStatus;
  bookingReference: string | null;
  cost: number | null;
  currency: string;
  phone: string | null;
  email: string | null;
  url: string | null;
  notes: string;
};

export type Expense = {
  id: ID;
  title: string;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  /** Multiply `amount` by this to get the trip currency. null when no rate is known. */
  rate: number | null;
  rateSource: RateSource | null;
  rateAt: string | null;
  dayId: ID | null;
  /** When set, this expense records the actual cost of that activity or stay. */
  activityId: ID | null;
  status: ExpenseStatus;
};

/** A conversion rate from `currency` into the trip currency. */
export type Rate = {
  currency: string;
  rate: number;
  at: string;
  source: RateSource;
};

export type Attachment = {
  id: ID;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  category: AttachmentCategory;
  activityId: ID | null;
  stayId: ID | null;
  createdAt: string;
};

export type Member = {
  id: ID;
  email: string;
  userId: ID | null;
  displayName: string | null;
  role: TripRole;
};

export type TripAggregate = {
  trip: Trip;
  destinations: Destination[];
  days: Day[];
  activities: Activity[];
  stays: Stay[];
  expenses: Expense[];
  rates: Rate[];
  attachments: Attachment[];
  members: Member[];
};

/** Summary used on My Trips. */
export type TripSummary = {
  id: ID;
  name: string;
  dateMode: DateMode;
  startDate: string | null;
  endDate: string | null;
  dayCount: number;
  destinationNames: string[];
  countries: string[];
  coverImageUrl: string | null;
  role: TripRole;
  ownerName: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  isSample: boolean;
  updatedAt: string;
  planning: PlanningChecklist;
};

export type PlanningChecklist = {
  hasDates: boolean;
  hasDestinations: boolean;
  /** Nights with accommodation / nights that need it. */
  nightsCovered: number;
  nightsTotal: number;
  /** Destination changes that have transport / total destination changes. */
  connectionsCovered: number;
  connectionsTotal: number;
  /** Days with at least one plan / total days. */
  daysPlanned: number;
};
