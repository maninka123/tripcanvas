import { z } from 'zod';
import { MAX_ROUTE_POINTS, routingProvider } from '@/services/routing';
import { rateLimit } from '@/services/provider-fetch';
import { authContext, serverEnv } from '@/server/context';
import { json, readJson, route } from '@/server/http';

const schema = z.object({
  mode: z.enum(['walk', 'bike', 'drive']),
  points: z.array(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })).min(2).max(MAX_ROUTE_POINTS),
});

/**
 * Calculated route through a day's places. An empty `legs` array means the
 * provider has no route (or the span is too long for that mode); the map
 * then draws a clearly labelled approximate connection instead.
 */
export const POST = route('routes.calculate', async (request, { requestId }) => {
  const { user } = await authContext();
  const input = await readJson(request, schema, 20_000);
  rateLimit(`routes:${user.id}`, 30);
  const result = await routingProvider(serverEnv()).route(input.points, input.mode);
  return json(result, { requestId, headers: { 'cache-control': 'private, max-age=86400' } });
});
