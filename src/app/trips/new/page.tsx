import type { Metadata } from 'next';
import { NewTripFlow } from '@/components/trips/NewTripFlow';
import { assistantConfigured } from '@/services/travel-assistant';
import { pageContext } from '@/server/page-context';
import { serverEnv } from '@/server/context';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New trip' };

export default async function NewTripPage() {
  const { user } = await pageContext('/trips/new');
  return <NewTripFlow user={{ name: user.displayName, email: user.email }} assistantAvailable={assistantConfigured(serverEnv())} />;
}
