import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { sectionTemplates } from '@/db/schema';
import { sectionFromTrip, summarizeSection } from '@/features/sections/sections';
import { starterSections } from '@/features/sections/starter-sections';
import { sectionPayloadSchema, type SectionPayload } from '@/features/trips/operations';
import { authContext } from '@/server/context';
import { badRequest, json, readJson, route } from '@/server/http';
import { requireTripRole } from '@/server/trips/access';
import { loadAggregate } from '@/server/trips/repository';

/** The user's own sections plus the built-in starter sections. */
export const GET = route('library.sections.list', async (_request, { requestId }) => {
  const { db, user } = await authContext();
  const rows = await db.select().from(sectionTemplates).where(and(eq(sectionTemplates.userId, user.id), isNull(sectionTemplates.deletedAt))).orderBy(desc(sectionTemplates.updatedAt));
  const own = rows.flatMap((row) => {
    const parsed = sectionPayloadSchema.safeParse(row.payload);
    return parsed.success ? [summarizeSection(row.id, parsed.data, { starter: false, updatedAt: row.updatedAt })] : [];
  });
  const starters = starterSections().map((section) => summarizeSection(section.id, section.payload, { starter: true, updatedAt: null }));
  return json({ sections: [...own, ...starters] }, { requestId });
});

const createSchema = z.union([
  z.object({ id: z.string().uuid(), fromTripId: z.string().min(1).max(120), destinationIds: z.array(z.string().max(120)).min(1).max(20), name: z.string().trim().min(1).max(120), description: z.string().trim().max(1000).nullable().optional() }),
  z.object({ id: z.string().uuid(), payload: sectionPayloadSchema }),
]);

/** Saves a section, either built from a trip's destinations or from a complete payload. */
export const POST = route('library.sections.create', async (request, { requestId }) => {
  const { db, user } = await authContext();
  const input = await readJson(request, createSchema);
  let payload: SectionPayload;
  if ('fromTripId' in input) {
    await requireTripRole(db, input.fromTripId, user, 'viewer');
    try {
      payload = sectionFromTrip(await loadAggregate(db, input.fromTripId), input.destinationIds, input.name, input.description ?? null);
    } catch (error) {
      throw badRequest(error instanceof Error ? error.message : 'That section could not be created.');
    }
  } else {
    payload = input.payload;
  }
  const [row] = await db.insert(sectionTemplates).values({
    id: input.id, userId: user.id, name: payload.name, description: payload.description ?? null, dayCount: payload.days.length,
    coverImageUrl: payload.destinations.find((destination) => destination.imageUrl)?.imageUrl ?? null, payload,
  }).onConflictDoNothing().returning();
  const summary = summarizeSection(input.id, payload, { starter: false, updatedAt: row?.updatedAt ?? null });
  return json({ section: summary }, { status: 201, requestId });
});
