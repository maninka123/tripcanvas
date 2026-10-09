/** True for absolute http(s) URLs; rejects javascript:, data: and relative values. */
export function isSafeHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Returns the URL if it is safe to render as a link, otherwise null. */
export function safeHref(value: string | null | undefined): string | null {
  return isSafeHttpUrl(value) ? (value as string) : null;
}

export function hostnameOf(value: string | null | undefined): string | null {
  if (!isSafeHttpUrl(value)) return null;
  return new URL(value as string).hostname.replace(/^www\./, '');
}

/** A link that opens a coordinate or address in the device's map app. */
export function mapsLink(place: { name: string; address?: string | null; lat?: number | null; lng?: number | null }): string {
  if (typeof place.lat === 'number' && typeof place.lng === 'number') {
    return `https://www.google.com/maps/search/?api=1&query=${place.lat.toFixed(6)},${place.lng.toFixed(6)}`;
  }
  const query = [place.name, place.address].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function directionsLink(place: { name: string; address?: string | null; lat?: number | null; lng?: number | null }, mode: 'walking' | 'driving' | 'transit' | 'bicycling' = 'transit'): string {
  const destination = typeof place.lat === 'number' && typeof place.lng === 'number'
    ? `${place.lat.toFixed(6)},${place.lng.toFixed(6)}`
    : encodeURIComponent([place.name, place.address].filter(Boolean).join(', '));
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=${mode}`;
}
