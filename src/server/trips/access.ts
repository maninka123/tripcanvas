import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { trips, tripTravellers } from '@/db/schema';
import type { TripRole } from '@/features/trips/types';
import type { CurrentUser } from '@/server/auth';
import { forbidden, notFound } from '@/server/http';

// Every trip read and write goes through `requireTripRole`. Roles come only
// from the database — never from the client.

const RANK: Record<TripRole, number> = { viewer: 1, editor: 2, owner: 3 };

export function roleAllows(role: TripRole | null, needed: TripRole): boolean {
  return role !== null && RANK[role] >= RANK[needed];
}

export async function getTripRole(db: Db, tripId: string, user: CurrentUser, options: { includeDeleted?: boolean } = {}): Promise<TripRole | null> {
  const [trip] = await db.select({ ownerId: trips.ownerId, deletedAt: trips.deletedAt }).from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip || (trip.deletedAt && !options.includeDeleted)) return null;
  if (trip.ownerId === user.id) return 'owner';
  if (trip.deletedAt) return null;
  const [membership] = await db.select({ id: tripTravellers.id, role: tripTravellers.role, userId: tripTravellers.userId })
    .from(tripTravellers)
    .where(and(eq(tripTravellers.tripId, tripId), isNull(tripTravellers.deletedAt), or(eq(tripTravellers.userId, user.id), eq(sql`lower(${tripTravellers.invitedEmail})`, user.email))))
    .limit(1);
  if (!membership) return null;
  // First visit after an email invitation: bind the invitation to this account.
  if (!membership.userId) await db.update(tripTravellers).set({ userId: user.id, updatedAt: new Date().toISOString() }).where(eq(tripTravellers.id, membership.id));
  return membership.role === 'editor' ? 'editor' : membership.role === 'owner' ? 'owner' : 'viewer';
}

/** Resolves the caller's role or throws 404 (no access is indistinguishable from not existing) / 403. */
export async function requireTripRole(db: Db, tripId: string, user: CurrentUser, needed: TripRole, options: { includeDeleted?: boolean } = {}): Promise<TripRole> {
  const role = await getTripRole(db, tripId, user, options);
  if (!role) throw notFound('Trip not found.');
  if (!roleAllows(role, needed)) throw forbidden(needed === 'owner' ? 'Only the trip owner can do that.' : 'You have view-only access to this trip.');
  return role;
}
