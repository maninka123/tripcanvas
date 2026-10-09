import { and, eq } from 'drizzle-orm';
import { sectionTemplates } from '@/db/schema';
import { summarizeSection } from '@/features/sections/sections';
import { starterSections } from '@/features/sections/starter-sections';
import { sectionPayloadSchema } from '@/features/trips/operations';
import { authContext } from '@/server/context';
import { badRequest, json, notFound, route, type RouteParams } from '@/server/http';

type Params = RouteParams<{ sectionId: string }>;

/** A section with its full payload, for preview and insertion. */
export const GET = route<Params>('library.sections.get', async (_request, { params, requestId }) => {
  const { sectionId } = await params;
  const { db, user } = await authContext();
  const starter = starterSections().find((section) => section.id === sectionId);
  if (starter) return json({ section: { ...summarizeSection(starter.id, starter.payload, { starter: true, updatedAt: null }), payload: starter.payload } }, { requestId });
  const [row] = await db.select().from(sectionTemplates).where(and(eq(sectionTemplates.id, sectionId), eq(sectionTemplates.userId, user.id))).limit(1);
  if (!row) throw notFound('Section not found.');
  const payload = sectionPayloadSchema.parse(row.payload);
  return json({ section: { ...summarizeSection(row.id, payload, { starter: false, updatedAt: row.updatedAt }), payload } }, { requestId });
});

export const DELETE = route<Params>('library.sections.delete', async (_request, { params, requestId }) => {
  const { sectionId } = await params;
  const { db, user } = await authContext();
  if (starterSections().some((section) => section.id === sectionId)) throw badRequest('Starter sections cannot be deleted.');
  const removed = await db.delete(sectionTemplates).where(and(eq(sectionTemplates.id, sectionId), eq(sectionTemplates.userId, user.id))).returning({ id: sectionTemplates.id });
  if (!removed.length) throw notFound('Section not found.');
  return json({ deleted: true }, { requestId });
});
