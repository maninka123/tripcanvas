import { tripToIcs } from '@/features/export/ics';
import { authContext } from '@/server/context';
import { badRequest, route, type RouteParams } from '@/server/http';
import { requireTripRole } from '@/server/trips/access';
import { loadAggregate } from '@/server/trips/repository';
import { contentDisposition } from '@/server/files';

/** Downloads the itinerary as an .ics calendar file. */
export const GET = route<RouteParams<{ tripId: string }>>('trips.calendar', async (_request, { params, requestId }) => {
  const { tripId } = await params;
  const { db, user } = await authContext();
  await requireTripRole(db, tripId, user, 'viewer');
  const aggregate = await loadAggregate(db, tripId);
  const ics = tripToIcs(aggregate);
  if (!ics) throw badRequest('Set trip dates to export a calendar.');
  const fileName = `${aggregate.trip.name.replace(/[^\p{L}\p{N} -]+/gu, '').trim() || 'trip'}.ics`;
  return new Response(ics, { headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': contentDisposition(fileName, false), 'cache-control': 'no-store', 'x-request-id': requestId } });
});
