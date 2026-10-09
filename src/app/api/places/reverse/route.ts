import { z } from 'zod';
import { placeSearchProvider } from '@/services/places';
import { rateLimit } from '@/services/provider-fetch';
import { authContext, serverEnv } from '@/server/context';
import { badRequest, json, route } from '@/server/http';

const querySchema = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) });

/** Names the place at a coordinate (used when a pasted map link has no name). */
export const GET = route('places.reverse', async (request, { requestId }) => {
  const { user } = await authContext();
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) throw badRequest('Provide lat and lng.');
  rateLimit(`places:${user.id}`, 60);
  const provider = placeSearchProvider(serverEnv());
  return json({ result: await provider.reverse(parsed.data.lat, parsed.data.lng), attribution: provider.attribution }, { requestId });
});
