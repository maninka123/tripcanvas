import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { trips, tripTravellers } from '@/db/schema';
import { authContext } from '@/server/context';
import { badRequest, forbidden, json, notFound, readJson, route, type RouteParams } from '@/server/http';
import { requireTripRole } from '@/server/trips/access';

type Params = RouteParams<{ tripId: string }>;

const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address').max(200), role: z.enum(['editor', 'viewer']) });
const updateSchema = z.object({ memberId: z.string().min(1).max(120), role: z.enum(['editor', 'viewer']) });

async function bumpVersion(db: Awaited<ReturnType<typeof authContext>>['db'], tripId: string) {
  // Membership changes are part of the trip, so other open clients refetch.
  await db.update(trips).set({ version: sql`${trips.version} + 1`, updatedAt: new Date().toISOString() }).where(eq(trips.id, tripId));
}

/**
 * Invites someone by email. They get access the next time they sign in with
 * that email; no email is sent by TripCanvas itself (share the trip link).
 */
export const POST = route<Params>('members.invite', async (request, { params, requestId }) => {
  const { tripId } = await params;
  const { db, user } = await authContext();
  await requireTripRole(db, tripId, user, 'owner');
  const input = await readJson(request, inviteSchema);
  if (input.email === user.email) throw badRequest('You already own this trip.');
  const [existing] = await db.select({ id: tripTravellers.id }).from(tripTravellers)
    .where(and(eq(tripTravellers.tripId, tripId), isNull(tripTravellers.deletedAt), eq(sql`lower(${tripTravellers.invitedEmail})`, input.email)));
  if (existing) {
    await db.update(tripTravellers).set({ role: input.role, updatedAt: new Date().toISOString() }).where(eq(tripTravellers.id, existing.id));
  } else {
    await db.insert(tripTravellers).values({ id: crypto.randomUUID(), tripId, invitedEmail: input.email, role: input.role });
  }
  await bumpVersion(db, tripId);
  return json({ invited: input.email, role: input.role }, { status: 201, requestId });
});

export const PATCH = route<Params>('members.update', async (request, { params, requestId }) => {
  const { tripId } = await params;
  const { db, user } = await authContext();
  await requireTripRole(db, tripId, user, 'owner');
  const input = await readJson(request, updateSchema);
  const updated = await db.update(tripTravellers).set({ role: input.role, updatedAt: new Date().toISOString() })
    .where(and(eq(tripTravellers.id, input.memberId), eq(tripTravellers.tripId, tripId), sql`${tripTravellers.role} <> 'owner'`)).returning({ id: tripTravellers.id });
  if (!updated.length) throw notFound('That person is not on this trip.');
  await bumpVersion(db, tripId);
  return json({ updated: true }, { requestId });
});

/** Removes someone. Owners can remove anyone else; members can remove themselves (leave). */
export const DELETE = route<Params>('members.remove', async (request, { params, requestId }) => {
  const { tripId } = await params;
  const { db, user } = await authContext();
  const role = await requireTripRole(db, tripId, user, 'viewer');
  const memberId = new URL(request.url).searchParams.get('memberId') ?? '';
  const [member] = await db.select().from(tripTravellers).where(and(eq(tripTravellers.id, memberId), eq(tripTravellers.tripId, tripId), isNull(tripTravellers.deletedAt)));
  if (!member) throw notFound('That person is not on this trip.');
  if (member.role === 'owner') throw badRequest('The owner cannot be removed.');
  const isSelf = member.userId === user.id || member.invitedEmail?.toLowerCase() === user.email;
  if (role !== 'owner' && !isSelf) throw forbidden('Only the trip owner can remove people.');
  await db.delete(tripTravellers).where(eq(tripTravellers.id, member.id));
  await bumpVersion(db, tripId);
  return json({ removed: true }, { requestId });
});
