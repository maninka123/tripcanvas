import type { Metadata } from 'next';
import { SavedPlacesScreen } from '@/components/places/SavedPlacesScreen';
import { pageContext } from '@/server/page-context';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Saved Places' };

export default async function SavedPlacesPage() {
  const { user } = await pageContext('/places');
  return <SavedPlacesScreen user={{ name: user.displayName, email: user.email }} />;
}
