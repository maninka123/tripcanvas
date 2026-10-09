import { z } from 'zod';
import { copyOperation } from '@/features/trips/copy';
import { authContext } from '@/server/context';
import { json, readJson, route, type RouteParams } from '@/server/http';
import { requireTripRole } from '@/server/trips/access';
import { createTrip, loadAggregate } from '@/server/trips/repository';

const schema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120).optional() });

/** Copies a trip the caller can view into a new trip they own. */
export const POST = route<RouteParams<{ tripId: string }>>('trips.duplicate', async (request, { params, requestId }) => {
  const { tripId } = await params;
  const { db, user } = await authContext();
  const input = await readJson(request, schema);
  await requireTripRole(db, tripId, user, 'viewer');
  const source = await loadAggregate(db, tripId);
  const copy = await createTrip(db, user, {
    id: input.id,
    name: input.name ?? `${source.trip.name} (copy)`,
    currency: source.trip.currency,
    coverImageUrl: source.trip.coverImageUrl,
    coverCredit: source.trip.coverCredit,
  }, [copyOperation(source)]);
  return json({ trip: copy, role: 'owner' }, { status: 201, requestId });
});
