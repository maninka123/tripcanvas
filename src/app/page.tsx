import { TripsDashboard } from '@/components/trips/TripsDashboard';
import { pageContext } from '@/server/page-context';
import { listTripSummaries } from '@/server/trips/repository';

export const dynamic = 'force-dynamic';

export default async function MyTripsPage() {
  const { db, user } = await pageContext('/');
  const trips = await listTripSummaries(db, user);
  return <TripsDashboard initialTrips={trips} user={{ name: user.displayName, email: user.email }} />;
}
