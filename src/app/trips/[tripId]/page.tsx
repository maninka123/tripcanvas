import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PlannerScreen } from '@/components/planner/PlannerScreen';
import { assistantConfigured } from '@/services/travel-assistant';
import { serverEnv } from '@/server/context';
import { ApiError } from '@/server/http';
import { pageContext } from '@/server/page-context';
import { requireTripRole } from '@/server/trips/access';
import { loadAggregate } from '@/server/trips/repository';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Trip planner' };

export default async function TripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { db, user } = await pageContext(`/trips/${tripId}`);
  let role;
  try {
    role = await requireTripRole(db, tripId, user, 'viewer');
  } catch (error) {
    if (error instanceof ApiError) notFound();
    throw error;
  }
  const aggregate = await loadAggregate(db, tripId);
  return <PlannerScreen key={tripId} initial={aggregate} role={role} user={{ id: user.id, name: user.displayName, email: user.email }} assistantAvailable={assistantConfigured(serverEnv())} />;
}
