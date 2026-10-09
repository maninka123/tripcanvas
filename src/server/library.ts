import type { libraryPlaces } from '@/db/schema';
import type { LibraryPlace } from '@/features/places/library';

export function toLibraryPlace(row: typeof libraryPlaces.$inferSelect): LibraryPlace {
  return {
    id: row.id, name: row.name, category: row.category as LibraryPlace['category'], address: row.address, city: row.city, country: row.country,
    lat: row.latitude, lng: row.longitude, providerId: row.providerId, url: row.url, notes: row.notes, createdAt: row.createdAt,
  };
}
