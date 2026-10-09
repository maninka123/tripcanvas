import { z } from 'zod';
import { destinationInfo } from '@/services/destination-info';
import { rateLimit } from '@/services/provider-fetch';
import { authContext, serverEnv } from '@/server/context';
import { badRequest, json, route } from '@/server/http';

const querySchema = z.object({
  title: z.string().trim().min(1).max(200),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

/** A short, attributed introduction and photo for a destination or landmark, when Wikipedia has one. */
export const GET = route('places.info', async (request, { requestId }) => {
  const { user } = await authContext();
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) throw badRequest('Provide a title.');
  rateLimit(`info:${user.id}`, 60);
  const { title, lat, lng } = parsed.data;
  const info = await destinationInfo(title, { contact: serverEnv().PROVIDER_CONTACT, near: lat !== undefined && lng !== undefined ? { lat, lng } : undefined });
  return json({ info }, { requestId, headers: { 'cache-control': 'private, max-age=3600' } });
});
