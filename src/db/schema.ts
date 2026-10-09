import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// D1 schema. Migration 0000 created the original tables; 0001 adds columns
// and tables without dropping anything, so existing rows survive. A few
// original tables (`bookings`, `links`, `route_legs`, `photos`, `locations`,
// `saved_places`) are retained for compatibility but are no longer written:
// booking details now live on the item that was booked.

const timestamps = {
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  deletedAt: text('deleted_at'),
};

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  ...timestamps,
}, (table) => [uniqueIndex('idx_users_email').on(table.email)]);

export const trips = sqliteTable('trips', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  description: text('description'),
  /** ISO date for fixed trips, '' for flexible trips. */
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  baseCurrency: text('base_currency').notNull().default('AUD'),
  budget: real('budget').notNull().default(0),
  status: text('status').notNull().default('idea'),
  coverPhotoUrl: text('cover_photo_url'),
  // Added in 0001.
  version: integer('version').notNull().default(0),
  dateMode: text('date_mode').notNull().default('fixed'),
  dayCount: integer('day_count').notNull().default(1),
  travellers: integer('travellers').notNull().default(1),
  pace: text('pace'),
  interests: text('interests', { mode: 'json' }).$type<string[]>(),
  notes: text('notes').notNull().default(''),
  coverCredit: text('cover_credit'),
  archivedAt: text('archived_at'),
  isSample: integer('is_sample', { mode: 'boolean' }).notNull().default(false),
  hasBudget: integer('has_budget', { mode: 'boolean' }).notNull().default(false),
  ...timestamps,
}, (table) => [index('idx_trips_owner_status').on(table.ownerId, table.status)]);

export const tripTravellers = sqliteTable('trip_travellers', {
  id: text('id').primaryKey(),
  tripId: text('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id),
  invitedEmail: text('invited_email'),
  role: text('role').notNull().default('viewer'),
  ...timestamps,
}, (table) => [index('idx_trip_travellers_trip').on(table.tripId), index('idx_trip_travellers_user').on(table.userId), index('idx_trip_travellers_email').on(table.invitedEmail)]);

export const locations = sqliteTable('locations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address'),
  city: text('city'),
  country: text('country'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  ...timestamps,
}, (table) => [index('idx_locations_city_country').on(table.city, table.country)]);

/** Destinations. */
export const tripSegments = sqliteTable('trip_segments', {
  id: text('id').primaryKey(),
  tripId: text('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  destinationName: text('destination_name').notNull(),
  country: text('country').notNull(),
  startDay: integer('start_day').notNull(),
  endDay: integer('end_day').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  latitude: real('latitude'),
  longitude: real('longitude'),
  colour: text('colour').notNull(),
  coverPhotoUrl: text('cover_photo_url'),
  sortOrder: integer('sort_order').notNull(),
  // Added in 0001.
  countryCode: text('country_code'),
  timezone: text('timezone'),
  description: text('description'),
  imageCredit: text('image_credit'),
  providerId: text('provider_id'),
  ...timestamps,
}, (table) => [index('idx_trip_segments_trip_sort').on(table.tripId, table.sortOrder)]);

export const tripDays = sqliteTable('trip_days', {
  id: text('id').primaryKey(),
  tripId: text('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  dayNumber: integer('day_number').notNull(),
  date: text('date').notNull(),
  title: text('title'),
  destinationSegmentId: text('destination_segment_id').references(() => tripSegments.id),
  notes: text('notes'),
  ...timestamps,
}, (table) => [uniqueIndex('idx_trip_days_trip_day').on(table.tripId, table.dayNumber), index('idx_trip_days_segment').on(table.destinationSegmentId)]);

/** Activities, transport and notes. `day_id` null = an idea not yet scheduled. */
export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  tripId: text('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  dayId: text('day_id').references(() => tripDays.id, { onDelete: 'set null' }),
  segmentId: text('segment_id').references(() => tripSegments.id, { onDelete: 'set null' }),
  locationId: text('location_id').references(() => locations.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description'),
  category: text('category').notNull(),
  subcategory: text('subcategory'),
  date: text('date'),
  /** Start time, or departure time for transport. */
  startTime: text('start_time'),
  /** Arrival time for transport. */
  endTime: text('end_time'),
  timePrecision: text('time_precision').notNull().default('unscheduled'),
  origin: text('origin'),
  destination: text('destination'),
  transportMode: text('transport_mode'),
  provider: text('provider'),
  serviceNumber: text('service_number'),
  terminal: text('terminal'),
  platform: text('platform'),
  gate: text('gate'),
  durationMinutes: integer('duration_minutes'),
  estimatedCost: real('estimated_cost'),
  actualCost: real('actual_cost'),
  currency: text('currency'),
  bookingStatus: text('booking_status').notNull().default('not_required'),
  paymentStatus: text('payment_status').notNull().default('not_paid'),
  confirmationNumber: text('confirmation_number'),
  notes: text('notes'),
  sortOrder: integer('sort_order').notNull().default(0),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  // Added in 0001.
  kind: text('kind').notNull().default('place'),
  timeSlot: text('time_slot').notNull().default('anytime'),
  placeName: text('place_name'),
  address: text('address'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  placeProviderId: text('place_provider_id'),
  url: text('url'),
  imageUrl: text('image_url'),
  originLatitude: real('origin_latitude'),
  originLongitude: real('origin_longitude'),
  destinationLatitude: real('destination_latitude'),
  destinationLongitude: real('destination_longitude'),
  arrivalDayOffset: integer('arrival_day_offset').notNull().default(0),
  departureTimezone: text('departure_timezone'),
  arrivalTimezone: text('arrival_timezone'),
  ...timestamps,
}, (table) => [index('idx_events_trip_day_sort').on(table.tripId, table.dayId, table.sortOrder), index('idx_events_trip_category').on(table.tripId, table.category), index('idx_events_booking_status').on(table.tripId, table.bookingStatus)]);

export const routeLegs = sqliteTable('route_legs', {
  id: text('id').primaryKey(),
  tripId: text('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  dayId: text('day_id').references(() => tripDays.id, { onDelete: 'set null' }),
  originLocationId: text('origin_location_id').references(() => locations.id),
  destinationLocationId: text('destination_location_id').references(() => locations.id),
  originEventId: text('origin_event_id').references(() => events.id),
  destinationEventId: text('destination_event_id').references(() => events.id),
  transportMode: text('transport_mode').notNull(),
  provider: text('provider'),
  serviceNumber: text('service_number'),
  departureTime: text('departure_time'),
  arrivalTime: text('arrival_time'),
  durationMinutes: integer('duration_minutes'),
  distanceKm: real('distance_km'),
  estimatedCost: real('estimated_cost'),
  actualCost: real('actual_cost'),
  currency: text('currency'),
  bookingStatus: text('booking_status').notNull().default('not_required'),
  sortOrder: integer('sort_order').notNull(),
  ...timestamps,
}, (table) => [index('idx_route_legs_trip_sort').on(table.tripId, table.sortOrder), index('idx_route_legs_day_sort').on(table.dayId, table.sortOrder)]);

/** Stays. A stay starts on `start_day_id` and covers `nights` consecutive nights. */
export const accommodations = sqliteTable('accommodations', {
  id: text('id').primaryKey(),
  tripId: text('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  eventId: text('event_id').references(() => events.id, { onDelete: 'set null' }),
  locationId: text('location_id').references(() => locations.id),
  propertyName: text('property_name').notNull(),
  propertyType: text('property_type').notNull(),
  /** Derived calendar dates ('' for flexible trips), kept for exports. */
  checkIn: text('check_in').notNull(),
  checkOut: text('check_out').notNull(),
  roomType: text('room_type'),
  mealPlan: text('meal_plan'),
  bookingProvider: text('booking_provider'),
  bookingReference: text('booking_reference'),
  estimatedCost: real('estimated_cost'),
  actualCost: real('actual_cost'),
  currency: text('currency'),
  paymentStatus: text('payment_status').notNull().default('not_paid'),
  bookingStatus: text('booking_status').notNull().default('researching'),
  cancellationDeadline: text('cancellation_deadline'),
  notes: text('notes'),
  // Added in 0001.
  segmentId: text('segment_id'),
  startDayId: text('start_day_id'),
  nights: integer('nights').notNull().default(1),
  placeName: text('place_name'),
  address: text('address'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  placeProviderId: text('place_provider_id'),
  checkInTime: text('check_in_time'),
  checkOutTime: text('check_out_time'),
  phone: text('phone'),
  email: text('email'),
  url: text('url'),
  ...timestamps,
}, (table) => [index('idx_accommodations_trip_dates').on(table.tripId, table.checkIn, table.checkOut)]);

export const links = sqliteTable('links', {
  id: text('id').primaryKey(),
  tripId: text('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  eventId: text('event_id').references(() => events.id, { onDelete: 'cascade' }),
  segmentId: text('segment_id').references(() => tripSegments.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  url: text('url').notNull(),
  description: text('description'),
  provider: text('provider'),
  linkType: text('link_type').notNull(),
  ...timestamps,
}, (table) => [index('idx_links_trip_event').on(table.tripId, table.eventId)]);

export const bookings = sqliteTable('bookings', {
  id: text('id').primaryKey(),
  tripId: text('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  eventId: text('event_id').references(() => events.id, { onDelete: 'set null' }),
  accommodationId: text('accommodation_id').references(() => accommodations.id, { onDelete: 'set null' }),
  bookingType: text('booking_type').notNull(),
  title: text('title').notNull(),
  provider: text('provider'),
  reference: text('reference'),
  status: text('status').notNull().default('researching'),
  paymentStatus: text('payment_status').notNull().default('not_paid'),
  bookedAt: text('booked_at'),
  bookingOpenDate: text('booking_open_date'),
  bookingDeadline: text('booking_deadline'),
  cancellationDeadline: text('cancellation_deadline'),
  cost: real('cost'),
  currency: text('currency'),
  ...timestamps,
}, (table) => [index('idx_bookings_trip_status').on(table.tripId, table.status), index('idx_bookings_deadlines').on(table.bookingDeadline, table.cancellationDeadline)]);

export const expenses = sqliteTable('expenses', {
  id: text('id').primaryKey(),
  tripId: text('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  /** Activity whose actual cost this expense records. */
  eventId: text('event_id').references(() => events.id, { onDelete: 'set null' }),
  category: text('category').notNull(),
  description: text('description').notNull(),
  amount: real('amount').notNull(),
  currency: text('currency').notNull(),
  /** Converted amount in `base_currency`; 0 with `rate_used` 0 when no rate was known. */
  convertedAmount: real('converted_amount').notNull(),
  baseCurrency: text('base_currency').notNull(),
  rateUsed: real('rate_used').notNull(),
  rateTimestamp: text('rate_timestamp').notNull(),
  expenseDate: text('expense_date').notNull(),
  status: text('status').notNull().default('planned'),
  // Added in 0001.
  dayId: text('day_id'),
  /** Stay whose actual cost this expense records. */
  accommodationId: text('accommodation_id'),
  rateSource: text('rate_source'),
  ...timestamps,
}, (table) => [index('idx_expenses_trip_date').on(table.tripId, table.expenseDate), index('idx_expenses_trip_category').on(table.tripId, table.category)]);

export const savedPlaces = sqliteTable('saved_places', {
  id: text('id').primaryKey(),
  tripId: text('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  segmentId: text('segment_id').references(() => tripSegments.id, { onDelete: 'set null' }),
  locationId: text('location_id').references(() => locations.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  category: text('category').notNull(),
  notes: text('notes'),
  sortOrder: integer('sort_order').notNull(),
  ...timestamps,
}, (table) => [index('idx_saved_places_trip_sort').on(table.tripId, table.sortOrder)]);

/** Private files in R2. Only metadata and the object key live here. */
export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  tripId: text('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  eventId: text('event_id').references(() => events.id, { onDelete: 'set null' }),
  bookingId: text('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
  category: text('category').notNull(),
  fileName: text('file_name').notNull(),
  objectKey: text('object_key').notNull(),
  contentType: text('content_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  // Added in 0001.
  accommodationId: text('accommodation_id'),
  uploadedBy: text('uploaded_by'),
  scanStatus: text('scan_status').notNull().default('not_scanned'),
  ...timestamps,
}, (table) => [index('idx_attachments_trip_category').on(table.tripId, table.category)]);

export const photos = sqliteTable('photos', {
  id: text('id').primaryKey(),
  tripId: text('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  eventId: text('event_id').references(() => events.id, { onDelete: 'set null' }),
  segmentId: text('segment_id').references(() => tripSegments.id, { onDelete: 'set null' }),
  objectKey: text('object_key'),
  sourceUrl: text('source_url'),
  caption: text('caption'),
  takenAt: text('taken_at'),
  sortOrder: integer('sort_order').notNull(),
  ...timestamps,
}, (table) => [index('idx_photos_trip_segment_sort').on(table.tripId, table.segmentId, table.sortOrder)]);

export const currencyRates = sqliteTable('currency_rates', {
  id: text('id').primaryKey(),
  tripId: text('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  fromCurrency: text('from_currency').notNull(),
  toCurrency: text('to_currency').notNull(),
  rate: real('rate').notNull(),
  effectiveAt: text('effective_at').notNull(),
  source: text('source').notNull().default('manual'),
  ...timestamps,
}, (table) => [index('idx_currency_rates_trip_pair').on(table.tripId, table.fromCurrency, table.toCurrency, table.effectiveAt)]);

export const aiSuggestions = sqliteTable('ai_suggestions', {
  id: text('id').primaryKey(),
  tripId: text('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  requestedBy: text('requested_by').references(() => users.id),
  prompt: text('prompt').notNull(),
  reason: text('reason').notNull(),
  proposedChanges: text('proposed_changes', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  status: text('status').notNull().default('pending'),
  ...timestamps,
}, (table) => [index('idx_ai_suggestions_trip_status').on(table.tripId, table.status)]);

// --- Added in 0001 -----------------------------------------------------------

/**
 * One row per applied mutation. The primary key is the client's mutation id,
 * which makes retries idempotent; `trip_id` is written through a version
 * guard so a stale write aborts the whole batch (see server/trips/persist.ts).
 */
export const tripMutations = sqliteTable('trip_mutations', {
  id: text('id').primaryKey(),
  tripId: text('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  version: integer('version').notNull(),
  source: text('source').notNull().default('user'),
  label: text('label'),
  operationCount: integer('operation_count').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index('idx_trip_mutations_trip').on(table.tripId, table.createdAt)]);

/** The user's own Saved Places, independent of any trip. */
export const libraryPlaces = sqliteTable('library_places', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  category: text('category').notNull().default('sight'),
  address: text('address'),
  city: text('city'),
  country: text('country'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  providerId: text('provider_id'),
  url: text('url'),
  notes: text('notes').notNull().default(''),
  ...timestamps,
}, (table) => [index('idx_library_places_user').on(table.userId, table.createdAt), index('idx_library_places_provider').on(table.userId, table.providerId)]);

/** Reusable sections ("3 days in Kyoto"): a JSON snapshot validated by `sectionPayloadSchema`. */
export const sectionTemplates = sqliteTable('section_templates', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  dayCount: integer('day_count').notNull(),
  coverImageUrl: text('cover_image_url'),
  payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  ...timestamps,
}, (table) => [index('idx_section_templates_user').on(table.userId, table.updatedAt)]);
