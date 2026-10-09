import { z } from 'zod';
import { activityCategorySchema } from '@/features/trips/operations';
import { isSafeHttpUrl } from '@/lib/urls';
import type { ActivityCategory } from '@/features/trips/types';

// Saved Places: the user's own collection of places, independent of trips.

export type LibraryPlace = {
  id: string;
  name: string;
  category: ActivityCategory;
  address: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  providerId: string | null;
  url: string | null;
  notes: string;
  createdAt: string;
};

const fields = {
  name: z.string().trim().min(1, 'Add a name').max(200),
  category: activityCategorySchema,
  address: z.string().trim().max(300).nullable(),
  city: z.string().trim().max(120).nullable(),
  country: z.string().trim().max(80).nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  providerId: z.string().max(120).nullable(),
  url: z.string().max(2000).refine(isSafeHttpUrl, 'Use a full http(s) link').nullable(),
  notes: z.string().trim().max(5000),
};

export const libraryPlaceInputSchema = z.object({
  id: z.string().uuid(),
  name: fields.name,
  category: fields.category.default('sight'),
  address: fields.address.default(null),
  city: fields.city.default(null),
  country: fields.country.default(null),
  lat: fields.lat.default(null),
  lng: fields.lng.default(null),
  providerId: fields.providerId.default(null),
  url: fields.url.default(null),
  notes: fields.notes.default(''),
});

/** Partial update: absent fields are left unchanged (no defaults applied). */
export const libraryPlacePatchSchema = z.object(fields).partial();
