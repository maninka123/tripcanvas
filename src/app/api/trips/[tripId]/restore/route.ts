import { authContext } from '@/server/context';
import { json, route, type RouteParams } from '@/server/http';
import { requireTripRole } from '@/server/trips/access';
import { restoreTrip } from '@/server/trips/repository';

/** Brings a trip back from Recently deleted. */
export const POST = route<RouteParams<{ tripId: string }>>('trips.restore', async (_request, { params, requestId }) => {
  const { tripId } = await params;
  const { db, user } = await authContext();
  await requireTripRole(db, tripId, user, 'owner', { includeDeleted: true });
  await restoreTrip(db, tripId);
  return json({ restored: true }, { requestId });
});
