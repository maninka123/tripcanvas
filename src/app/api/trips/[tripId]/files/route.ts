import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { accommodations, attachments, events, trips } from '@/db/schema';
import { authContext, serverEnv } from '@/server/context';
import { noScanner, safeFileName, validateUpload } from '@/server/files';
import { ApiError, badRequest, json, route, type RouteParams } from '@/server/http';
import { requireTripRole } from '@/server/trips/access';
import { attachmentFromRow } from '@/server/trips/mapping';

const fieldsSchema = z.object({
  category: z.enum(['ticket', 'confirmation', 'voucher', 'insurance', 'other']).default('other'),
  activityId: z.string().max(120).nullable().default(null),
  stayId: z.string().max(120).nullable().default(null),
});

/** Uploads a private document to R2 and records it against the trip (and optionally an item). */
export const POST = route<RouteParams<{ tripId: string }>>('files.upload', async (request, { params, requestId }) => {
  const { tripId } = await params;
  const { db, user } = await authContext();
  await requireTripRole(db, tripId, user, 'editor');
  const bucket = serverEnv().FILES;
  if (!bucket) throw new ApiError(503, 'unavailable', 'File storage is not configured for this deployment.');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw badRequest('Send the file as multipart form data.');
  }
  const file = form.get('file');
  if (!(file instanceof File)) throw badRequest('Choose a file to upload.');
  const fields = fieldsSchema.parse({
    category: form.get('category') ?? undefined,
    activityId: form.get('activityId') || null,
    stayId: form.get('stayId') || null,
  });
  const bytes = await file.arrayBuffer();
  const format = validateUpload(file, new Uint8Array(bytes.slice(0, 16)));

  // Links must point at items in this same trip.
  if (fields.activityId) {
    const [owned] = await db.select({ id: events.id }).from(events).where(and(eq(events.id, fields.activityId), eq(events.tripId, tripId)));
    if (!owned) throw badRequest('That plan is not part of this trip.');
  }
  if (fields.stayId) {
    const [owned] = await db.select({ id: accommodations.id }).from(accommodations).where(and(eq(accommodations.id, fields.stayId), eq(accommodations.tripId, tripId)));
    if (!owned) throw badRequest('That stay is not part of this trip.');
  }

  const scanStatus = await noScanner.scan(bytes, format.contentType);
  if (scanStatus === 'infected') throw badRequest('That file was rejected by the malware scanner.');
  const id = crypto.randomUUID();
  const objectKey = `trips/${tripId}/${id}`;
  const fileName = safeFileName(file.name, format.extension);
  await bucket.put(objectKey, bytes, { httpMetadata: { contentType: format.contentType }, customMetadata: { tripId, uploadedBy: user.id } });
  const [row] = await db.insert(attachments).values({
    id, tripId, eventId: fields.activityId, accommodationId: fields.stayId, category: fields.category, fileName, objectKey,
    contentType: format.contentType, sizeBytes: file.size, uploadedBy: user.id, scanStatus,
  }).returning();
  await db.update(trips).set({ version: sql`${trips.version} + 1`, updatedAt: new Date().toISOString() }).where(eq(trips.id, tripId));
  return json({ attachment: attachmentFromRow(row) }, { status: 201, requestId });
});
