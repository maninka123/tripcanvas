import type { PlaceResult } from '@/services/places';
import type { Destination, PlaceRef } from '@/features/trips/types';
import { api } from '@/lib/api-client';

export type DestinationInfoResponse = { info: { title: string; description: string | null; extract: string; imageUrl: string | null; sourceUrl: string; credit: string } | null };

export function placeRefFrom(place: PlaceResult): PlaceRef {
  return { name: place.name, address: place.address, lat: place.lat, lng: place.lng, providerId: place.providerId };
}

export function destinationFrom(place: PlaceResult, id: string = crypto.randomUUID()): Omit<Destination, 'sortOrder' | 'startDay' | 'endDay' | 'color'> & { color?: string } {
  return {
    id,
    name: place.name,
    country: place.country ?? '',
    countryCode: place.countryCode,
    lat: place.lat,
    lng: place.lng,
    timezone: place.timezone,
    description: null,
    imageUrl: null,
    imageCredit: null,
    providerId: place.providerId,
  };
}

/** Looks up an attributed introduction and photo. Returns null when there is no confident match. */
export async function fetchDestinationInfo(name: string, near?: { lat: number | null; lng: number | null }) {
  const params = new URLSearchParams({ title: name });
  if (typeof near?.lat === 'number' && typeof near?.lng === 'number') { params.set('lat', String(near.lat)); params.set('lng', String(near.lng)); }
  try {
    const data = await api<DestinationInfoResponse>(`/api/places/info?${params}`);
    return data.info;
  } catch {
    return null;
  }
}

/** Cleans a Wikipedia extract down to a two-sentence introduction. */
export function shortIntro(extract: string, sentences = 2): string {
  const parts = extract.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [extract];
  return parts.slice(0, sentences).join('').trim();
}
