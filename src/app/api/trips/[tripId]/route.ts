import { authContext } from '@/server/context';
import { json, route, type RouteParams } from '@/server/http';
import { requireTripRole } from '@/server/trips/access';
import { loadAggregate, softDeleteTrip } from '@/server/trips/repository';

type Params = RouteParams<{ tripId: string }>;

/** The whole trip aggregate plus the caller's role. */
export const GET = route<Params>('trips.get', async (_request, { params, requestId }) => {
  const { tripId } = await params;
  const { db, user } = await authContext();
  const role = await requireTripRole(db, tripId, user, 'viewer');
  return json({ trip: await loadAggregate(db, tripId), role }, { requestId });
});

/** Moves the trip to Recently deleted (restorable for 30 days). Owner only. */
export const DELETE = route<Params>('trips.delete', async (_request, { params, requestId }) => {
  const { tripId } = await params;
  const { db, user } = await authContext();
  await requireTripRole(db, tripId, user, 'owner');
  await softDeleteTrip(db, tripId);
  return json({ deleted: true }, { requestId });
});
