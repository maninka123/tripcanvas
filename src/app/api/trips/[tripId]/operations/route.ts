import { mutationRequestSchema } from '@/features/trips/operations';
import { authContext } from '@/server/context';
import { json, readJson, route, type RouteParams } from '@/server/http';
import { requireTripRole } from '@/server/trips/access';
import { applyMutation } from '@/server/trips/repository';

type Params = RouteParams<{ tripId: string }>;

/**
 * Applies a batch of trip operations atomically. Safe to retry: the same
 * `mutationId` is applied at most once.
 */
export const POST = route<Params>('trips.operations', async (request, { params, requestId }) => {
  const { tripId } = await params;
  const { db, user } = await authContext();
  const mutation = await readJson(request, mutationRequestSchema);
  const archives = mutation.operations.some((operation) => operation.type === 'trip.update' && operation.patch.archived !== undefined);
  await requireTripRole(db, tripId, user, archives ? 'owner' : 'editor');
  const outcome = await applyMutation(db, user, tripId, mutation);
  return json(outcome, { requestId });
});
