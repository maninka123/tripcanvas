import { createTripSchema, creationOperations, defaultTripName } from '@/features/trips/create';
import { authContext } from '@/server/context';
import { json, readJson, route } from '@/server/http';
import { createTrip, listTripSummaries, purgeDeletedTrips } from '@/server/trips/repository';

/** My Trips: owned and shared trips with planning progress. */
export const GET = route('trips.list', async (_request, { requestId }) => {
  const { db, user } = await authContext();
  await purgeDeletedTrips(db, user.id);
  return json({ trips: await listTripSummaries(db, user) }, { requestId });
});

/** Creates a trip. Retrying with the same `id` returns the existing trip instead of a duplicate. */
export const POST = route('trips.create', async (request, { requestId }) => {
  const { db, user } = await authContext();
  const input = await readJson(request, createTripSchema);
  const aggregate = await createTrip(db, user, {
    id: input.id,
    name: input.name?.trim() || defaultTripName(input.destinations),
    currency: input.currency,
    coverImageUrl: input.coverImageUrl ?? input.destinations.find((destination) => destination.imageUrl)?.imageUrl ?? null,
    coverCredit: input.coverCredit ?? input.destinations.find((destination) => destination.imageUrl)?.imageCredit ?? null,
  }, creationOperations(input));
  return json({ trip: aggregate, role: 'owner' }, { status: 201, requestId });
});
