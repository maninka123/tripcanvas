import type { accommodations, attachments, currencyRates, events, expenses, tripDays, trips, tripSegments } from '@/db/schema';
import { DESTINATION_COLORS } from '@/features/trips/reducer';
import { tripPhase } from '@/features/trips/selectors';
import { tripEndDate } from '@/lib/dates';
import type {
  Activity, ActivityCategory, Attachment, AttachmentCategory, BookingStatus, Day, Destination, Expense, ExpenseCategory, PlaceRef, Rate,
  Stay, StayType, TimeSlot, TransportMode, Trip,
} from '@/features/trips/types';

// Converts between D1 rows and the domain model. Readers accept the values
// written by the original Roamly schema so legacy rows still load.

type TripRow = typeof trips.$inferSelect;
type SegmentRow = typeof tripSegments.$inferSelect;
type DayRow = typeof tripDays.$inferSelect;
type EventRow = typeof events.$inferSelect;
type StayRow = typeof accommodations.$inferSelect;
type ExpenseRow = typeof expenses.$inferSelect;
type RateRow = typeof currencyRates.$inferSelect;
type AttachmentRow = typeof attachments.$inferSelect;

const BOOKING: Record<string, BookingStatus> = {
  none: 'none', idea: 'idea', planned: 'planned', booked: 'booked', cancelled: 'cancelled',
  not_required: 'none', researching: 'idea', shortlisted: 'idea', need_to_book: 'planned', reserved: 'booked', paid: 'booked',
};
const bookingStatus = (value: string | null | undefined): BookingStatus => BOOKING[(value ?? '').toLowerCase().replaceAll(' ', '_')] ?? 'none';

const CATEGORIES: ActivityCategory[] = ['sight', 'food', 'activity', 'nature', 'shopping', 'nightlife', 'other'];
const LEGACY_CATEGORY: Record<string, ActivityCategory> = { attraction: 'sight', food: 'food', activity: 'activity', accommodation: 'other', note: 'other', transport: 'other' };
const activityCategory = (value: string): ActivityCategory => (CATEGORIES.includes(value as ActivityCategory) ? value as ActivityCategory : LEGACY_CATEGORY[value.toLowerCase()] ?? 'other');

const MODES: TransportMode[] = ['flight', 'train', 'bus', 'ferry', 'car', 'taxi', 'transfer', 'walk', 'bike', 'other'];
const LEGACY_MODE: Record<string, TransportMode> = { high_speed_train: 'train', rental_car: 'car', bicycle: 'bike', walking: 'walk' };
const transportMode = (value: string | null): TransportMode => (MODES.includes(value as TransportMode) ? value as TransportMode : LEGACY_MODE[value ?? ''] ?? 'other');

const SLOTS: TimeSlot[] = ['morning', 'afternoon', 'evening', 'anytime'];
const STAY_TYPES: StayType[] = ['hotel', 'hostel', 'apartment', 'guesthouse', 'other'];
const EXPENSE_CATEGORIES: ExpenseCategory[] = ['accommodation', 'transport', 'food', 'activities', 'shopping', 'other'];
const ATTACHMENT_CATEGORIES: AttachmentCategory[] = ['ticket', 'confirmation', 'voucher', 'insurance', 'other'];

const orNull = <T,>(value: T | null | undefined): T | null => (value === undefined || value === '' ? null : value);

function placeOf(name: string | null, address: string | null, lat: number | null, lng: number | null, providerId: string | null): PlaceRef | null {
  if (!name) return null;
  return { name, address: orNull(address), lat: orNull(lat), lng: orNull(lng), providerId: orNull(providerId) };
}

// --- reading ---------------------------------------------------------------

export function tripFromRow(row: TripRow): Trip {
  const flexible = row.dateMode === 'flexible' || !row.startDate;
  return {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    dateMode: flexible ? 'flexible' : 'fixed',
    startDate: flexible ? null : row.startDate,
    dayCount: row.dayCount,
    currency: row.baseCurrency,
    budget: row.hasBudget || row.budget > 0 ? row.budget : null,
    travellers: row.travellers,
    pace: (row.pace as Trip['pace']) ?? null,
    interests: Array.isArray(row.interests) ? row.interests : [],
    notes: row.notes ?? row.description ?? '',
    coverImageUrl: row.coverPhotoUrl?.startsWith('http') ? row.coverPhotoUrl : null,
    coverCredit: row.coverCredit,
    archivedAt: row.archivedAt,
    isSample: row.isSample,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function destinationFromRow(row: SegmentRow, index: number): Destination {
  return {
    id: row.id,
    name: row.destinationName,
    country: row.country,
    countryCode: row.countryCode,
    lat: row.latitude === 0 && row.longitude === 0 ? null : row.latitude,
    lng: row.latitude === 0 && row.longitude === 0 ? null : row.longitude,
    timezone: row.timezone,
    sortOrder: row.sortOrder,
    startDay: row.startDay || null,
    endDay: row.endDay || null,
    description: row.description,
    imageUrl: row.coverPhotoUrl,
    imageCredit: row.imageCredit,
    color: /^#[0-9a-f]{6}$/i.test(row.colour) ? row.colour : DESTINATION_COLORS[index % DESTINATION_COLORS.length],
    providerId: row.providerId,
  };
}

export function dayFromRow(row: DayRow): Day {
  return { id: row.id, number: row.dayNumber, date: orNull(row.date), destinationId: row.destinationSegmentId, title: row.title === 'Open day' ? '' : row.title ?? '', notes: row.notes ?? '' };
}

export function activityFromRow(row: EventRow): Activity {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const legacyTransport = row.category === 'Transport';
  const kind = row.kind === 'transport' || legacyTransport ? 'transport' : row.kind === 'note' || row.category === 'Note' ? 'note' : 'place';
  const legacyLocation = typeof metadata.location === 'string' ? metadata.location : null;
  return {
    id: row.id,
    dayId: row.dayId,
    destinationId: row.segmentId,
    kind,
    category: activityCategory(row.category),
    title: row.title,
    sortOrder: row.sortOrder,
    timeSlot: SLOTS.includes(row.timeSlot as TimeSlot) ? row.timeSlot as TimeSlot : 'anytime',
    startTime: kind === 'transport' ? null : row.startTime,
    durationMinutes: row.durationMinutes,
    place: kind === 'transport' ? null : placeOf(row.placeName ?? legacyLocation, row.address, row.latitude, row.longitude, row.placeProviderId),
    notes: row.notes ?? row.description ?? '',
    url: row.url,
    imageUrl: row.imageUrl,
    cost: row.estimatedCost,
    currency: row.currency ?? 'AUD',
    bookingStatus: bookingStatus(row.bookingStatus),
    bookingReference: row.confirmationNumber,
    transport: kind === 'transport' ? {
      mode: transportMode(row.transportMode),
      from: placeOf(row.origin ?? 'Origin', (metadata.fromAddress as string) ?? null, row.originLatitude, row.originLongitude, (metadata.fromProviderId as string) ?? null)!,
      to: placeOf(row.destination ?? 'Destination', (metadata.toAddress as string) ?? null, row.destinationLatitude, row.destinationLongitude, (metadata.toProviderId as string) ?? null)!,
      departTime: row.startTime,
      arriveTime: row.endTime,
      arriveDayOffset: row.arrivalDayOffset,
      departTimezone: row.departureTimezone,
      arriveTimezone: row.arrivalTimezone,
      operator: row.provider,
      serviceNumber: row.serviceNumber,
    } : null,
  };
}

export function stayFromRow(row: StayRow): Stay {
  return {
    id: row.id,
    name: row.propertyName,
    type: STAY_TYPES.includes(row.propertyType as StayType) ? row.propertyType as StayType : 'hotel',
    place: placeOf(row.placeName, row.address, row.latitude, row.longitude, row.placeProviderId),
    destinationId: row.segmentId,
    startDayId: row.startDayId,
    nights: row.nights,
    checkInTime: row.checkInTime,
    checkOutTime: row.checkOutTime,
    bookingStatus: bookingStatus(row.bookingStatus),
    bookingReference: row.bookingReference,
    cost: row.estimatedCost,
    currency: row.currency ?? 'AUD',
    phone: row.phone,
    email: row.email,
    url: row.url,
    notes: row.notes ?? '',
  };
}

export function expenseFromRow(row: ExpenseRow): Expense {
  return {
    id: row.id,
    title: row.description,
    category: EXPENSE_CATEGORIES.includes(row.category as ExpenseCategory) ? row.category as ExpenseCategory : 'other',
    amount: row.amount,
    currency: row.currency,
    rate: row.rateUsed > 0 ? row.rateUsed : null,
    rateSource: row.rateUsed > 0 ? (row.rateSource === 'provider' ? 'provider' : 'manual') : null,
    rateAt: orNull(row.rateTimestamp),
    dayId: row.dayId,
    activityId: row.eventId ?? row.accommodationId,
    status: row.status === 'paid' ? 'paid' : 'planned',
  };
}

export function rateFromRow(row: RateRow): Rate {
  return { currency: row.fromCurrency, rate: row.rate, at: row.effectiveAt, source: row.source === 'provider' ? 'provider' : 'manual' };
}

export function attachmentFromRow(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    category: ATTACHMENT_CATEGORIES.includes(row.category as AttachmentCategory) ? row.category as AttachmentCategory : 'other',
    activityId: row.eventId,
    stayId: row.accommodationId,
    createdAt: row.createdAt,
  };
}

// --- writing ---------------------------------------------------------------

export function tripToRow(trip: Trip, now: string) {
  const end = tripEndDate(trip.dateMode === 'fixed' ? trip.startDate : null, trip.dayCount);
  return {
    name: trip.name,
    description: null,
    startDate: trip.dateMode === 'fixed' && trip.startDate ? trip.startDate : '',
    endDate: end ?? '',
    baseCurrency: trip.currency,
    budget: trip.budget ?? 0,
    hasBudget: trip.budget !== null,
    status: tripPhase(trip.dateMode === 'fixed' ? trip.startDate : null, end),
    coverPhotoUrl: trip.coverImageUrl,
    dateMode: trip.dateMode,
    dayCount: trip.dayCount,
    travellers: trip.travellers,
    pace: trip.pace,
    interests: trip.interests,
    notes: trip.notes,
    coverCredit: trip.coverCredit,
    archivedAt: trip.archivedAt,
    isSample: trip.isSample,
    updatedAt: now,
  };
}

export function destinationToRow(destination: Destination, tripId: string, days: Day[], now: string) {
  const own = days.filter((day) => day.destinationId === destination.id);
  return {
    id: destination.id,
    tripId,
    destinationName: destination.name,
    country: destination.country,
    startDay: destination.startDay ?? 0,
    endDay: destination.endDay ?? 0,
    startDate: own[0]?.date ?? '',
    endDate: own[own.length - 1]?.date ?? '',
    latitude: destination.lat,
    longitude: destination.lng,
    colour: destination.color,
    coverPhotoUrl: destination.imageUrl,
    sortOrder: destination.sortOrder,
    countryCode: destination.countryCode,
    timezone: destination.timezone,
    description: destination.description,
    imageCredit: destination.imageCredit,
    providerId: destination.providerId,
    updatedAt: now,
  };
}

export function dayToRow(day: Day, tripId: string, now: string) {
  return { id: day.id, tripId, dayNumber: day.number, date: day.date ?? '', title: day.title, destinationSegmentId: day.destinationId, notes: day.notes, updatedAt: now };
}

export function activityToRow(activity: Activity, tripId: string, dayDate: string | null, now: string) {
  const transport = activity.kind === 'transport' ? activity.transport : null;
  const place = transport ? null : activity.place;
  return {
    id: activity.id,
    tripId,
    dayId: activity.dayId,
    segmentId: activity.destinationId,
    title: activity.title,
    description: null,
    category: activity.category,
    date: dayDate,
    startTime: transport ? transport.departTime : activity.startTime,
    endTime: transport ? transport.arriveTime : null,
    timePrecision: (transport ? transport.departTime : activity.startTime) ? 'exact' : activity.timeSlot,
    origin: transport?.from.name ?? null,
    destination: transport?.to.name ?? null,
    transportMode: transport?.mode ?? null,
    provider: transport?.operator ?? null,
    serviceNumber: transport?.serviceNumber ?? null,
    durationMinutes: activity.durationMinutes,
    estimatedCost: activity.cost,
    currency: activity.currency,
    bookingStatus: activity.bookingStatus,
    confirmationNumber: activity.bookingReference,
    notes: activity.notes,
    sortOrder: activity.sortOrder,
    metadata: transport ? { fromAddress: transport.from.address ?? null, toAddress: transport.to.address ?? null, fromProviderId: transport.from.providerId ?? null, toProviderId: transport.to.providerId ?? null } : null,
    kind: activity.kind,
    timeSlot: activity.timeSlot,
    placeName: place?.name ?? null,
    address: place?.address ?? null,
    latitude: place?.lat ?? null,
    longitude: place?.lng ?? null,
    placeProviderId: place?.providerId ?? null,
    url: activity.url,
    imageUrl: activity.imageUrl,
    originLatitude: transport?.from.lat ?? null,
    originLongitude: transport?.from.lng ?? null,
    destinationLatitude: transport?.to.lat ?? null,
    destinationLongitude: transport?.to.lng ?? null,
    arrivalDayOffset: transport?.arriveDayOffset ?? 0,
    departureTimezone: transport?.departTimezone ?? null,
    arrivalTimezone: transport?.arriveTimezone ?? null,
    updatedAt: now,
  };
}

export function stayToRow(stay: Stay, tripId: string, days: Day[], now: string) {
  const start = days.find((day) => day.id === stay.startDayId);
  const out = start ? days.find((day) => day.number === start.number + stay.nights) : undefined;
  const checkIn = start?.date ?? '';
  const checkOut = out?.date ?? (start?.date ? addDaysSafe(start.date, stay.nights) : '');
  return {
    id: stay.id,
    tripId,
    propertyName: stay.name,
    propertyType: stay.type,
    checkIn,
    checkOut,
    bookingReference: stay.bookingReference,
    estimatedCost: stay.cost,
    currency: stay.currency,
    bookingStatus: stay.bookingStatus,
    notes: stay.notes,
    segmentId: stay.destinationId,
    startDayId: stay.startDayId,
    nights: stay.nights,
    placeName: stay.place?.name ?? null,
    address: stay.place?.address ?? null,
    latitude: stay.place?.lat ?? null,
    longitude: stay.place?.lng ?? null,
    placeProviderId: stay.place?.providerId ?? null,
    checkInTime: stay.checkInTime,
    checkOutTime: stay.checkOutTime,
    phone: stay.phone,
    email: stay.email,
    url: stay.url,
    updatedAt: now,
  };
}

function addDaysSafe(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  return new Date(value.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

export function expenseToRow(expense: Expense, tripId: string, tripCurrency: string, days: Day[], stayIds: Set<string>, now: string) {
  const rate = expense.currency === tripCurrency ? 1 : expense.rate;
  const isStay = expense.activityId ? stayIds.has(expense.activityId) : false;
  return {
    id: expense.id,
    tripId,
    eventId: isStay ? null : expense.activityId,
    accommodationId: isStay ? expense.activityId : null,
    category: expense.category,
    description: expense.title,
    amount: expense.amount,
    currency: expense.currency,
    convertedAmount: rate ? Math.round(expense.amount * rate * 100) / 100 : 0,
    baseCurrency: tripCurrency,
    rateUsed: rate ?? 0,
    rateTimestamp: expense.rateAt ?? '',
    rateSource: expense.rateSource,
    expenseDate: days.find((day) => day.id === expense.dayId)?.date ?? '',
    status: expense.status,
    dayId: expense.dayId,
    updatedAt: now,
  };
}

export function rateToRow(rate: Rate, tripId: string, tripCurrency: string, now: string) {
  return { id: `${tripId}:${rate.currency}`, tripId, fromCurrency: rate.currency, toCurrency: tripCurrency, rate: rate.rate, effectiveAt: rate.at, source: rate.source, updatedAt: now };
}
