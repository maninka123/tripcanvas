import tzlookup from '@photostructure/tz-lookup';
import { categoryFromPlaceKind } from '@/features/trips/factory';
import type { ActivityCategory } from '@/features/trips/types';
import { fetchProviderJson } from './provider-fetch';

// Place search behind a provider interface. The default implementation uses
// Photon (OpenStreetMap data, komoot's public instance), which needs no key
// and permits autocomplete. Swap `PLACES_BASE_URL` for a self-hosted Photon,
// or implement `PlaceSearchProvider` for a commercial provider.

export type PlaceResult = {
  providerId: string | null;
  name: string;
  /** Raw provider type, e.g. "museum", "city". */
  kind: string;
  category: ActivityCategory;
  isLocality: boolean;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  lat: number;
  lng: number;
  timezone: string | null;
};

export type PlaceSearchInput = { query: string; near?: { lat: number; lng: number } | null; scope: 'any' | 'locality'; limit?: number };

export interface PlaceSearchProvider {
  readonly name: string;
  readonly attribution: string;
  search(input: PlaceSearchInput): Promise<PlaceResult[]>;
  reverse(lat: number, lng: number): Promise<PlaceResult | null>;
}

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_type?: string; osm_id?: number; osm_key?: string; osm_value?: string; type?: string; name?: string;
    housenumber?: string; street?: string; locality?: string; district?: string; city?: string; county?: string; state?: string;
    country?: string; countrycode?: string;
  };
};

const LOCALITY_TYPES = new Set(['city', 'town', 'village', 'hamlet', 'municipality', 'county', 'state', 'region', 'province', 'island', 'archipelago', 'country', 'district', 'borough', 'suburb', 'quarter']);

export function timezoneAt(lat: number, lng: number): string | null {
  try {
    return tzlookup(lat, lng);
  } catch {
    return null;
  }
}

export function mapPhotonFeature(feature: PhotonFeature): PlaceResult | null {
  const p = feature.properties;
  const [lng, lat] = feature.geometry.coordinates;
  const name = p.name ?? p.street;
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const isLocality = p.osm_key === 'place' || p.osm_key === 'boundary' || LOCALITY_TYPES.has(p.type ?? '');
  const city = p.city ?? (isLocality ? null : p.locality ?? p.county ?? null);
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const address = [street, p.district, city !== name ? city : null, p.state, p.country].filter(Boolean).join(', ') || null;
  return {
    providerId: `osm:${p.osm_type ?? '?'}${p.osm_id ?? `${lat},${lng}`}`,
    name,
    kind: p.osm_value ?? p.type ?? 'place',
    category: categoryFromPlaceKind(p.osm_value),
    isLocality,
    address,
    city: isLocality ? name : city,
    region: p.state ?? null,
    country: p.country ?? null,
    countryCode: p.countrycode ? p.countrycode.toUpperCase() : null,
    lat,
    lng,
    timezone: timezoneAt(lat, lng),
  };
}

export class PhotonPlaceSearch implements PlaceSearchProvider {
  readonly name = 'Photon';
  readonly attribution = 'Search by Photon · © OpenStreetMap contributors';

  constructor(private readonly baseUrl = 'https://photon.komoot.io', private readonly contact?: string) {}

  async search(input: PlaceSearchInput): Promise<PlaceResult[]> {
    const url = new URL('/api/', this.baseUrl);
    url.searchParams.set('q', input.query);
    url.searchParams.set('limit', String(Math.min(input.limit ?? 8, 15) * (input.scope === 'locality' ? 2 : 1)));
    url.searchParams.set('lang', 'en');
    if (input.scope === 'locality') {
      // Photon's layers classify settlements by type; OSM place tags are too
      // inconsistent (Tokyo is tagged place=province, its airport place=island).
      for (const layer of ['city', 'county', 'state', 'country', 'district']) url.searchParams.append('layer', layer);
    } else if (input.near) {
      url.searchParams.set('lat', input.near.lat.toFixed(4));
      url.searchParams.set('lon', input.near.lng.toFixed(4));
      url.searchParams.set('location_bias_scale', '0.3');
    }
    const data = await fetchProviderJson<{ features?: PhotonFeature[] }>(this.name, url.toString(), { ttlSeconds: 86_400, contact: this.contact });
    const seen = new Set<string>();
    return (data.features ?? [])
      .map(mapPhotonFeature)
      .filter((place): place is PlaceResult => !!place)
      .filter((place) => {
        const key = `${place.name}|${place.city}|${place.country}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, input.limit ?? 8);
  }

  async reverse(lat: number, lng: number): Promise<PlaceResult | null> {
    const url = new URL('/reverse', this.baseUrl);
    url.searchParams.set('lat', lat.toFixed(6));
    url.searchParams.set('lon', lng.toFixed(6));
    url.searchParams.set('lang', 'en');
    const data = await fetchProviderJson<{ features?: PhotonFeature[] }>(this.name, url.toString(), { ttlSeconds: 86_400, contact: this.contact });
    const feature = data.features?.[0];
    const place = feature ? mapPhotonFeature(feature) : null;
    // Keep the exact pasted coordinates rather than the nearest mapped object's.
    return place ? { ...place, lat, lng } : null;
  }
}

export function placeSearchProvider(env: { PLACES_BASE_URL?: string; PROVIDER_CONTACT?: string }): PlaceSearchProvider {
  return new PhotonPlaceSearch(env.PLACES_BASE_URL || undefined, env.PROVIDER_CONTACT);
}
