import { decodePolyline, distanceKm, type LatLng } from '@/lib/geo';
import { fetchProviderJson } from './provider-fetch';

// Routing behind a provider interface. The default uses Valhalla on the
// FOSSGIS public server (OpenStreetMap data), which supports walking,
// cycling and driving. Public transport routing is not offered: the app
// shows an approximate connection instead of inventing a transit route.

export type RouteMode = 'walk' | 'bike' | 'drive';

export type RouteLeg = {
  /** [lng, lat] pairs following the road/path network. */
  coordinates: [number, number][];
  distanceKm: number;
  durationMinutes: number;
};

export type RouteResult = { mode: RouteMode; provider: string; attribution: string; legs: RouteLeg[] };

export interface RoutingProvider {
  readonly name: string;
  readonly attribution: string;
  route(points: LatLng[], mode: RouteMode): Promise<RouteResult>;
}

const COSTING: Record<RouteMode, string> = { walk: 'pedestrian', bike: 'bicycle', drive: 'auto' };
export const MAX_ROUTE_POINTS = 20;
/** Beyond this straight-line span, walking/cycling routes are not requested. */
const MAX_SPAN_KM: Record<RouteMode, number> = { walk: 60, bike: 200, drive: 1500 };

type ValhallaResponse = { trip?: { legs?: { shape: string; summary: { length: number; time: number } }[] } };

export class ValhallaRouting implements RoutingProvider {
  readonly name = 'Valhalla';
  readonly attribution = 'Routing by Valhalla (FOSSGIS) · © OpenStreetMap contributors';

  constructor(private readonly baseUrl = 'https://valhalla1.openstreetmap.de', private readonly contact?: string) {}

  async route(points: LatLng[], mode: RouteMode): Promise<RouteResult> {
    const span = points.slice(1).reduce((sum, point, index) => sum + distanceKm(points[index], point), 0);
    if (span > MAX_SPAN_KM[mode]) return { mode, provider: this.name, attribution: this.attribution, legs: [] };
    const body = {
      locations: points.map((point) => ({ lat: Number(point.lat.toFixed(6)), lon: Number(point.lng.toFixed(6)), type: 'break' })),
      costing: COSTING[mode],
      directions_options: { units: 'kilometers' },
      directions_type: 'none',
    };
    // GET with the JSON in the query string so responses can be edge-cached.
    const url = `${this.baseUrl}/route?json=${encodeURIComponent(JSON.stringify(body))}`;
    const data = await fetchProviderJson<ValhallaResponse>(this.name, url, { ttlSeconds: 7 * 86_400, contact: this.contact, timeoutMs: 12_000 });
    const legs = (data.trip?.legs ?? []).map((leg) => ({
      coordinates: decodePolyline(leg.shape, 6),
      distanceKm: Math.round(leg.summary.length * 10) / 10,
      durationMinutes: Math.max(1, Math.round(leg.summary.time / 60)),
    }));
    return { mode, provider: this.name, attribution: this.attribution, legs };
  }
}

export function routingProvider(env: { ROUTING_BASE_URL?: string; PROVIDER_CONTACT?: string }): RoutingProvider {
  return new ValhallaRouting(env.ROUTING_BASE_URL || undefined, env.PROVIDER_CONTACT);
}
