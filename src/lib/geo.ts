export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371;
const toRad = (degrees: number) => (degrees * Math.PI) / 180;
const toDeg = (radians: number) => (radians * 180) / Math.PI;

/** Great-circle distance in kilometres. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Points along the great circle between a and b, as [lng, lat] pairs (for flight arcs). */
export function greatCircle(a: LatLng, b: LatLng, segments = 48): [number, number][] {
  const lat1 = toRad(a.lat); const lng1 = toRad(a.lng);
  const lat2 = toRad(b.lat); const lng2 = toRad(b.lng);
  const d = 2 * Math.asin(Math.sqrt(Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2));
  if (d === 0) return [[a.lng, a.lat], [b.lng, b.lat]];
  const points: [number, number][] = [];
  for (let index = 0; index <= segments; index += 1) {
    const f = index / segments;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
    const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    points.push([toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
  }
  // Keep longitudes continuous across the antimeridian so MapLibre draws one arc.
  for (let index = 1; index < points.length; index += 1) {
    while (points[index][0] - points[index - 1][0] > 180) points[index][0] -= 360;
    while (points[index][0] - points[index - 1][0] < -180) points[index][0] += 360;
  }
  return points;
}

export type Bounds = [[number, number], [number, number]];

export function boundsOf(points: LatLng[]): Bounds | null {
  if (!points.length) return null;
  const lngs = points.map((point) => point.lng);
  const lats = points.map((point) => point.lat);
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
}

export function isLatLng(value: { lat?: number | null; lng?: number | null } | null | undefined): value is LatLng {
  return !!value && typeof value.lat === 'number' && typeof value.lng === 'number' && Number.isFinite(value.lat) && Number.isFinite(value.lng);
}

/** Decodes an encoded polyline (precision 5 for OSRM/Google, 6 for Valhalla) into [lng, lat] pairs. */
export function decodePolyline(encoded: string, precision = 6): [number, number][] {
  const factor = 10 ** precision;
  const coordinates: [number, number][] = [];
  let index = 0; let lat = 0; let lng = 0;
  while (index < encoded.length) {
    for (const axis of [0, 1]) {
      let result = 0; let shift = 0; let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index < encoded.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta; else lng += delta;
    }
    coordinates.push([lng / factor, lat / factor]);
  }
  return coordinates;
}
