import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TravelMode } from '@/components/travel/TravelMode';
import { ApiError } from '@/server/http';
import { pageContext } from '@/server/page-context';
import { requireTripRole } from '@/server/trips/access';
import { loadAggregate } from '@/server/trips/repository';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Travel Mode' };

export default async function TravelPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { db, user } = await pageContext(`/trips/${tripId}/travel`);
  try {
    await requireTripRole(db, tripId, user, 'viewer');
  } catch (error) {
    if (error instanceof ApiError) notFound();
    throw error;
  }
  return <TravelMode initial={await loadAggregate(db, tripId)} />;
}
