import { z } from 'zod';
import { MAX_TRIP_DAYS, isIsoDate } from '@/lib/dates';
import { destinationInputSchema, newOp, paceSchema, type Operation } from './operations';

// Input for "New trip". Only a name or destination is required; everything
// else can be added later in the planner.

export const createTripSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().max(120).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).default('AUD'),
  dateMode: z.enum(['fixed', 'flexible']),
  startDate: z.string().refine(isIsoDate, 'Choose a valid start date').nullable(),
  dayCount: z.number().int().min(1, 'A trip needs at least one day').max(MAX_TRIP_DAYS, `Trips can be up to ${MAX_TRIP_DAYS} days`),
  destinations: z.array(destinationInputSchema.extend({ color: z.string().optional(), dayCount: z.number().int().min(0).max(60).optional() })).max(20).default([]),
  travellers: z.number().int().min(1).max(50).optional(),
  budget: z.number().min(0).max(1_000_000_000).nullable().optional(),
  pace: paceSchema.nullable().optional(),
  interests: z.array(z.string().max(40)).max(20).optional(),
  coverImageUrl: z.string().url().nullable().optional(),
  coverCredit: z.string().max(300).nullable().optional(),
}).refine((value) => value.dateMode === 'flexible' || !!value.startDate, { message: 'Choose a start date or pick flexible dates', path: ['startDate'] })
  .refine((value) => !!value.name?.trim() || value.destinations.length > 0, { message: 'Add a destination or a trip name', path: ['name'] });

export type CreateTripInput = z.input<typeof createTripSchema>;

/** Splits `total` days across destinations as evenly as possible, earlier stops first. */
export function splitDays(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const extra = total % count;
  return Array.from({ length: count }, (_, index) => Math.max(1, base + (index < extra ? 1 : 0)));
}

export function defaultTripName(destinations: { name: string; country: string }[]): string {
  if (!destinations.length) return 'New trip';
  const countries = [...new Set(destinations.map((destination) => destination.country).filter(Boolean))];
  if (destinations.length === 1) return `${destinations[0].name} trip`;
  if (countries.length === 1) return `${countries[0]} trip`;
  return `${destinations[0].name} to ${destinations[destinations.length - 1].name}`;
}

export function creationOperations(input: z.output<typeof createTripSchema>): Operation[] {
  const operations: Operation[] = [newOp({ type: 'trip.setDates', dateMode: input.dateMode, startDate: input.dateMode === 'fixed' ? input.startDate : null, dayCount: input.dayCount })];
  const explicit = input.destinations.every((destination) => destination.dayCount !== undefined);
  const split = splitDays(input.dayCount, input.destinations.length);
  input.destinations.forEach((destination, index) => {
    const { dayCount, ...fields } = destination;
    operations.push(newOp({ type: 'destination.add', destination: fields, dayCount: explicit ? dayCount! : split[index] }));
  });
  const patch: Extract<Operation, { type: 'trip.update' }>['patch'] = {};
  if (input.travellers) patch.travellers = input.travellers;
  if (input.budget !== undefined && input.budget !== null) patch.budget = input.budget;
  if (input.pace) patch.pace = input.pace;
  if (input.interests?.length) patch.interests = input.interests;
  if (Object.keys(patch).length) operations.push(newOp({ type: 'trip.update', patch }));
  return operations;
}
