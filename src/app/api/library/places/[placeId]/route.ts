import { and, eq } from 'drizzle-orm';
import { libraryPlaces } from '@/db/schema';
import { libraryPlacePatchSchema } from '@/features/places/library';
import { authContext } from '@/server/context';
import { json, notFound, readJson, route, type RouteParams } from '@/server/http';
import { toLibraryPlace } from '@/server/library';

type Params = RouteParams<{ placeId: string }>;

export const PATCH = route<Params>('library.places.update', async (request, { params, requestId }) => {
  const { placeId } = await params;
  const { db, user } = await authContext();
  const input = await readJson(request, libraryPlacePatchSchema);
  const { lat, lng, ...rest } = input;
  const [row] = await db.update(libraryPlaces)
    .set({ ...rest, ...(lat !== undefined ? { latitude: lat } : {}), ...(lng !== undefined ? { longitude: lng } : {}), updatedAt: new Date().toISOString() })
    .where(and(eq(libraryPlaces.id, placeId), eq(libraryPlaces.userId, user.id))).returning();
  if (!row) throw notFound('Saved place not found.');
  return json({ place: toLibraryPlace(row) }, { requestId });
});

export const DELETE = route<Params>('library.places.delete', async (_request, { params, requestId }) => {
  const { placeId } = await params;
  const { db, user } = await authContext();
  const removed = await db.delete(libraryPlaces).where(and(eq(libraryPlaces.id, placeId), eq(libraryPlaces.userId, user.id))).returning({ id: libraryPlaces.id });
  if (!removed.length) throw notFound('Saved place not found.');
  return json({ deleted: true }, { requestId });
});
