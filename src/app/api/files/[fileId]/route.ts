import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { accommodations, attachments, events, trips } from '@/db/schema';
import { authContext, serverEnv } from '@/server/context';
import { contentDisposition } from '@/server/files';
import { ApiError, badRequest, json, notFound, readJson, route, type RouteParams } from '@/server/http';
import { requireTripRole } from '@/server/trips/access';
import { attachmentFromRow } from '@/server/trips/mapping';

type Params = RouteParams<{ fileId: string }>;

async function findAttachment(fileId: string) {
  const context = await authContext();
  const [row] = await context.db.select().from(attachments).where(and(eq(attachments.id, fileId), isNull(attachments.deletedAt))).limit(1);
  if (!row) throw notFound('File not found.');
  return { ...context, row };
}

/**
 * Streams a private file to a member of its trip. The response can never
 * run as a page: nosniff, a sandboxing CSP, and no shared caching.
 */
export const GET = route<Params>('files.get', async (request, { params, requestId }) => {
  const { fileId } = await params;
  const { db, user, row } = await findAttachment(fileId);
  await requireTripRole(db, row.tripId, user, 'viewer');
  const object = await serverEnv().FILES?.get(row.objectKey);
  if (!object) throw new ApiError(404, 'not_found', 'The file is missing from storage.');
  const download = new URL(request.url).searchParams.get('download') === '1';
  return new Response(object.body, {
    headers: {
      'content-type': row.contentType,
      'content-length': String(object.size),
      'content-disposition': contentDisposition(row.fileName, !download),
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      'cache-control': 'private, max-age=300',
      'x-request-id': requestId,
    },
  });
});

const patchSchema = z.object({
  category: z.enum(['ticket', 'confirmation', 'voucher', 'insurance', 'other']).optional(),
  activityId: z.string().max(120).nullable().optional(),
  stayId: z.string().max(120).nullable().optional(),
  fileName: z.string().trim().min(1).max(120).optional(),
});

/** Re-labels or re-links a file to a plan or stay in the same trip. */
export const PATCH = route<Params>('files.update', async (request, { params, requestId }) => {
  const { fileId } = await params;
  const { db, user, row } = await findAttachment(fileId);
  await requireTripRole(db, row.tripId, user, 'editor');
  const input = await readJson(request, patchSchema);
  if (input.activityId) {
    const [owned] = await db.select({ id: events.id }).from(events).where(and(eq(events.id, input.activityId), eq(events.tripId, row.tripId)));
    if (!owned) throw badRequest('That plan is not part of this trip.');
  }
  if (input.stayId) {
    const [owned] = await db.select({ id: accommodations.id }).from(accommodations).where(and(eq(accommodations.id, input.stayId), eq(accommodations.tripId, row.tripId)));
    if (!owned) throw badRequest('That stay is not part of this trip.');
  }
  const extension = row.fileName.match(/\.[^.]+$/)?.[0] ?? '';
  const [updated] = await db.update(attachments).set({
    category: input.category ?? row.category,
    eventId: input.activityId === undefined ? row.eventId : input.activityId,
    accommodationId: input.stayId === undefined ? row.accommodationId : input.stayId,
    fileName: input.fileName ? `${input.fileName.replace(/\.[^.]+$/, '')}${extension}` : row.fileName,
    updatedAt: new Date().toISOString(),
  }).where(eq(attachments.id, row.id)).returning();
  await db.update(trips).set({ version: sql`${trips.version} + 1` }).where(eq(trips.id, row.tripId));
  return json({ attachment: attachmentFromRow(updated) }, { requestId });
});

/** Deletes the file from storage and the trip. */
export const DELETE = route<Params>('files.delete', async (_request, { params, requestId }) => {
  const { fileId } = await params;
  const { db, user, row } = await findAttachment(fileId);
  await requireTripRole(db, row.tripId, user, 'editor');
  await serverEnv().FILES?.delete(row.objectKey);
  await db.delete(attachments).where(eq(attachments.id, row.id));
  await db.update(trips).set({ version: sql`${trips.version} + 1` }).where(eq(trips.id, row.tripId));
  return json({ deleted: true }, { requestId });
});
