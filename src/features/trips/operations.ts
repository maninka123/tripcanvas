import { z } from 'zod';
import { isIsoDate, isTime, MAX_TRIP_DAYS } from '@/lib/dates';
import { isSafeHttpUrl } from '@/lib/urls';

// Every change to a trip is expressed as one of these operations. The same
// schema validates edits from the UI, undo/redo, and AI-assistant proposals,
// and the same reducer (reducer.ts) applies them on the client and server.

export const idSchema = z.string().regex(/^[A-Za-z0-9:_.-]{1,120}$/, 'Invalid identifier');
const shortText = (max: number) => z.string().trim().max(max);
const currencySchema = z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code');
const timeSchema = z.string().refine(isTime, 'Use HH:mm').nullable();
const dateSchema = z.string().refine(isIsoDate, 'Use a valid date');
const latSchema = z.number().min(-90).max(90).nullable();
const lngSchema = z.number().min(-180).max(180).nullable();
const urlSchema = z.string().max(2000).refine(isSafeHttpUrl, 'Use a full http(s) link').nullable();
const moneySchema = z.number().finite().min(0).max(1_000_000_000).nullable();
const timezoneSchema = z.string().max(64).regex(/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/).nullable();
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const bookingStatusSchema = z.enum(['none', 'idea', 'planned', 'booked', 'cancelled']);
export const activityKindSchema = z.enum(['place', 'transport', 'note']);
export const activityCategorySchema = z.enum(['sight', 'food', 'activity', 'nature', 'shopping', 'nightlife', 'other']);
export const timeSlotSchema = z.enum(['morning', 'afternoon', 'evening', 'anytime']);
export const transportModeSchema = z.enum(['flight', 'train', 'bus', 'ferry', 'car', 'taxi', 'transfer', 'walk', 'bike', 'other']);
export const stayTypeSchema = z.enum(['hotel', 'hostel', 'apartment', 'guesthouse', 'other']);
export const expenseCategorySchema = z.enum(['accommodation', 'transport', 'food', 'activities', 'shopping', 'other']);
export const paceSchema = z.enum(['relaxed', 'balanced', 'packed']);

export const placeRefSchema = z.object({
  name: shortText(200).min(1),
  address: shortText(300).nullish(),
  lat: latSchema.optional(),
  lng: lngSchema.optional(),
  providerId: shortText(120).nullish(),
});

export const transportSchema = z.object({
  mode: transportModeSchema,
  from: placeRefSchema,
  to: placeRefSchema,
  departTime: timeSchema,
  arriveTime: timeSchema,
  arriveDayOffset: z.number().int().min(0).max(3),
  departTimezone: timezoneSchema,
  arriveTimezone: timezoneSchema,
  operator: shortText(120).nullable(),
  serviceNumber: shortText(40).nullable(),
});

const activityFields = {
  kind: activityKindSchema,
  category: activityCategorySchema,
  title: shortText(200).min(1, 'Add a title'),
  timeSlot: timeSlotSchema,
  startTime: timeSchema,
  durationMinutes: z.number().int().min(0).max(4320).nullable(),
  place: placeRefSchema.nullable(),
  notes: shortText(5000),
  url: urlSchema,
  imageUrl: urlSchema,
  cost: moneySchema,
  currency: currencySchema,
  bookingStatus: bookingStatusSchema,
  bookingReference: shortText(120).nullable(),
  transport: transportSchema.nullable(),
};

export const activitySchema = z.object({
  id: idSchema,
  dayId: idSchema.nullable(),
  destinationId: idSchema.nullable(),
  sortOrder: z.number().int().min(0).max(100_000),
  ...activityFields,
});
export const activityPatchSchema = z.object({ ...activityFields, destinationId: idSchema.nullable() }).partial();

const destinationFields = {
  name: shortText(120).min(1, 'Add a destination name'),
  country: shortText(80),
  countryCode: z.string().regex(/^[A-Z]{2}$/).nullable(),
  lat: latSchema,
  lng: lngSchema,
  timezone: timezoneSchema,
  description: shortText(2000).nullable(),
  imageUrl: urlSchema,
  imageCredit: shortText(300).nullable(),
  color: colorSchema,
  providerId: shortText(120).nullable(),
};
export const destinationInputSchema = z.object({ id: idSchema, ...destinationFields });
export const destinationSchema = destinationInputSchema.extend({
  sortOrder: z.number().int().min(0),
  startDay: z.number().int().nullable(),
  endDay: z.number().int().nullable(),
});
export const destinationPatchSchema = z.object(destinationFields).partial();

export const daySchema = z.object({
  id: idSchema,
  number: z.number().int().min(1).max(MAX_TRIP_DAYS + 60),
  date: dateSchema.nullable(),
  destinationId: idSchema.nullable(),
  title: shortText(160),
  notes: shortText(5000),
});
export const dayPatchSchema = z.object({ title: shortText(160), notes: shortText(5000) }).partial();

const stayFields = {
  name: shortText(200).min(1, 'Add the property name'),
  type: stayTypeSchema,
  place: placeRefSchema.nullable(),
  destinationId: idSchema.nullable(),
  startDayId: idSchema.nullable(),
  nights: z.number().int().min(1).max(MAX_TRIP_DAYS),
  checkInTime: timeSchema,
  checkOutTime: timeSchema,
  bookingStatus: bookingStatusSchema,
  bookingReference: shortText(120).nullable(),
  cost: moneySchema,
  currency: currencySchema,
  phone: shortText(40).nullable(),
  email: z.string().max(200).email().nullable().or(z.literal('').transform(() => null)),
  url: urlSchema,
  notes: shortText(5000),
};
export const staySchema = z.object({ id: idSchema, ...stayFields });
export const stayPatchSchema = z.object(stayFields).partial();

const expenseFields = {
  title: shortText(200).min(1, 'Describe the expense'),
  category: expenseCategorySchema,
  amount: z.number().finite().min(0).max(1_000_000_000),
  currency: currencySchema,
  rate: z.number().finite().positive().max(1_000_000).nullable(),
  rateSource: z.enum(['manual', 'provider']).nullable(),
  rateAt: z.string().max(40).nullable(),
  dayId: idSchema.nullable(),
  activityId: idSchema.nullable(),
  status: z.enum(['planned', 'paid']),
};
export const expenseSchema = z.object({ id: idSchema, ...expenseFields });
export const expensePatchSchema = z.object(expenseFields).partial();

export const rateSchema = z.object({
  currency: currencySchema,
  rate: z.number().finite().positive().max(1_000_000),
  at: z.string().max(40),
  source: z.enum(['manual', 'provider']),
});

export const tripPatchSchema = z.object({
  name: shortText(120).min(1, 'Give the trip a name'),
  currency: currencySchema,
  budget: moneySchema,
  travellers: z.number().int().min(1).max(50),
  pace: paceSchema.nullable(),
  interests: z.array(shortText(40)).max(20),
  notes: shortText(20_000),
  coverImageUrl: urlSchema,
  coverCredit: shortText(300).nullable(),
  archived: z.boolean(),
}).partial();

/** A reusable section: destinations and days without any trip-specific identifiers. */
export const sectionPayloadSchema = z.object({
  name: shortText(120).min(1),
  description: shortText(1000).nullable().optional(),
  destinations: z.array(z.object(destinationFields).extend({ color: colorSchema.optional() })).min(1).max(20),
  days: z.array(z.object({
    destinationIndex: z.number().int().min(0),
    title: shortText(160),
    notes: shortText(5000),
    activities: z.array(z.object(activityFields)).max(60),
  })).min(1).max(60),
  stays: z.array(z.object({
    ...stayFields,
    destinationId: z.null().optional(),
    startDayId: z.null().optional(),
    startDayIndex: z.number().int().min(0),
  })).max(30).optional(),
});
export type SectionPayload = z.infer<typeof sectionPayloadSchema>;

const op = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.object({ id: idSchema, type: z.literal(type), ...shape });

export const operationSchema = z.discriminatedUnion('type', [
  op('trip.update', { patch: tripPatchSchema }),
  op('trip.setDates', {
    dateMode: z.enum(['fixed', 'flexible']),
    startDate: dateSchema.nullable(),
    dayCount: z.number().int().min(1).max(MAX_TRIP_DAYS),
  }),
  op('destination.add', {
    destination: destinationInputSchema.extend({ color: colorSchema.optional() }),
    dayCount: z.number().int().min(0).max(60),
    index: z.number().int().min(0).optional(),
  }),
  op('destination.update', { destinationId: idSchema, patch: destinationPatchSchema }),
  op('destination.remove', { destinationId: idSchema }),
  op('destination.move', { destinationId: idSchema, toIndex: z.number().int().min(0) }),
  op('destination.setDays', { destinationId: idSchema, dayCount: z.number().int().min(0).max(60) }),
  op('day.update', { dayId: idSchema, patch: dayPatchSchema }),
  op('day.remove', { dayId: idSchema }),
  // `index` is the position within the day (or Ideas); omitted = append.
  op('activity.add', { activity: activitySchema.omit({ sortOrder: true }), index: z.number().int().min(0).optional() }),
  op('activity.update', { activityId: idSchema, patch: activityPatchSchema }),
  op('activity.move', { activityId: idSchema, dayId: idSchema.nullable(), index: z.number().int().min(0) }),
  op('activity.remove', { activityId: idSchema }),
  op('stay.add', { stay: staySchema }),
  op('stay.update', { stayId: idSchema, patch: stayPatchSchema }),
  op('stay.remove', { stayId: idSchema }),
  op('expense.add', { expense: expenseSchema }),
  op('expense.update', { expenseId: idSchema, patch: expensePatchSchema }),
  op('expense.remove', { expenseId: idSchema }),
  op('rate.set', { rate: rateSchema }),
  op('rate.remove', { currency: currencySchema }),
  op('section.insert', { index: z.number().int().min(0), section: sectionPayloadSchema }),
  op('restore', {
    trip: tripPatchSchema.optional(),
    dates: z.object({ dateMode: z.enum(['fixed', 'flexible']), startDate: dateSchema.nullable() }).optional(),
    put: z.object({
      destinations: z.array(destinationSchema).max(200).optional(),
      days: z.array(daySchema).max(400).optional(),
      activities: z.array(activitySchema).max(2000).optional(),
      stays: z.array(staySchema).max(400).optional(),
      expenses: z.array(expenseSchema).max(2000).optional(),
      rates: z.array(rateSchema).max(100).optional(),
    }).optional(),
    remove: z.object({
      destinations: z.array(idSchema).max(200).optional(),
      days: z.array(idSchema).max(400).optional(),
      activities: z.array(idSchema).max(2000).optional(),
      stays: z.array(idSchema).max(400).optional(),
      expenses: z.array(idSchema).max(2000).optional(),
      rates: z.array(currencySchema).max(100).optional(),
    }).optional(),
  }),
]);

export type Operation = z.infer<typeof operationSchema>;
export type OperationType = Operation['type'];
export type OperationOf<T extends OperationType> = Extract<Operation, { type: T }>;

/** Distributes Omit over the union so `newOp({ type, ...fields })` stays type-checked. */
export type OperationInput = Operation extends infer O ? (O extends Operation ? Omit<O, 'id'> : never) : never;

export const MAX_OPERATIONS_PER_MUTATION = 200;

export const mutationRequestSchema = z.object({
  mutationId: z.string().uuid(),
  baseVersion: z.number().int().min(0),
  operations: z.array(operationSchema).min(1).max(MAX_OPERATIONS_PER_MUTATION),
  /** Free-text label for the audit log (e.g. "Move Lijiang Old Town"). */
  label: z.string().max(200).optional(),
  source: z.enum(['user', 'assistant', 'undo']).default('user'),
});
export type MutationRequest = z.infer<typeof mutationRequestSchema>;

export function newOp(input: OperationInput, id: string = crypto.randomUUID()): Operation {
  return { ...input, id } as Operation;
}
