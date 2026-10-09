import { and, desc, eq, isNull } from 'drizzle-orm';
import { libraryPlaces } from '@/db/schema';
import { libraryPlaceInputSchema } from '@/features/places/library';
import { toLibraryPlace } from '@/server/library';
import { authContext } from '@/server/context';
import { json, readJson, route } from '@/server/http';

export const GET = route('library.places.list', async (_request, { requestId }) => {
  const { db, user } = await authContext();
  const rows = await db.select().from(libraryPlaces).where(and(eq(libraryPlaces.userId, user.id), isNull(libraryPlaces.deletedAt))).orderBy(desc(libraryPlaces.createdAt)).limit(1000);
  return json({ places: rows.map(toLibraryPlace) }, { requestId });
});

/** Saves a place. Saving the same provider place again returns the existing entry. */
export const POST = route('library.places.create', async (request, { requestId }) => {
  const { db, user } = await authContext();
  const input = await readJson(request, libraryPlaceInputSchema);
  if (input.providerId) {
    const [existing] = await db.select().from(libraryPlaces).where(and(eq(libraryPlaces.userId, user.id), eq(libraryPlaces.providerId, input.providerId), isNull(libraryPlaces.deletedAt))).limit(1);
    if (existing) return json({ place: toLibraryPlace(existing), duplicate: true }, { requestId });
  }
  const [existingId] = await db.select().from(libraryPlaces).where(eq(libraryPlaces.id, input.id)).limit(1);
  if (existingId) return json({ place: toLibraryPlace(existingId), duplicate: true }, { requestId });
  const [row] = await db.insert(libraryPlaces).values({
    id: input.id, userId: user.id, name: input.name, category: input.category, address: input.address, city: input.city, country: input.country,
    latitude: input.lat, longitude: input.lng, providerId: input.providerId, url: input.url, notes: input.notes,
  }).returning();
  return json({ place: toLibraryPlace(row), duplicate: false }, { status: 201, requestId });
});
