import { z } from 'zod';
import { sampleTrip } from '@/features/samples/sample-trip';
import { authContext } from '@/server/context';
import { json, readJson, route } from '@/server/http';
import { createTrip } from '@/server/trips/repository';

/** Creates the sample trip in the caller's account — only on explicit request. */
export const POST = route('samples.create', async (request, { requestId }) => {
  const { db, user } = await authContext();
  const { id } = await readJson(request, z.object({ id: z.string().uuid() }));
  const sample = sampleTrip();
  const trip = await createTrip(db, user, { id, name: sample.name, currency: 'AUD', isSample: true, coverImageUrl: sample.coverImageUrl }, sample.operations);
  return json({ trip, role: 'owner' }, { status: 201, requestId });
});
