import { z } from 'zod';
import { placeSearchProvider } from '@/services/places';
import { rateLimit } from '@/services/provider-fetch';
import { authContext, serverEnv } from '@/server/context';
import { badRequest, json, route } from '@/server/http';

const querySchema = z.object({
  q: z.string().trim().min(2, 'Type at least two characters').max(120),
  scope: z.enum(['any', 'locality']).default('any'),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  limit: z.coerce.number().int().min(1).max(15).default(8),
});

/** Place autocomplete, proxied so the provider and its usage policy stay server-side. */
export const GET = route('places.search', async (request, { requestId }) => {
  const { user } = await authContext();
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid search.');
  rateLimit(`places:${user.id}`, 60);
  const provider = placeSearchProvider(serverEnv());
  const { q, scope, lat, lng, limit } = parsed.data;
  const results = await provider.search({ query: q, scope, limit, near: lat !== undefined && lng !== undefined ? { lat, lng } : null });
  return json({ results, attribution: provider.attribution }, { requestId, headers: { 'cache-control': 'private, max-age=300' } });
});
