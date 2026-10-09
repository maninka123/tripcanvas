// Reads a place out of a pasted map link. Only formats whose coordinates are
// in the URL are supported; short links (goo.gl, maps.app.goo.gl) are not,
// because resolving them would mean following redirects to a third party.

/** Parses coordinates out of common map links (Google Maps, Apple Maps, OSM) or a plain "lat, lng". */
export function parseMapLink(input: string): { lat: number; lng: number; name: string | null } | null {
  const text = input.trim();
  const valid = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const plain = text.match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (plain && valid(Number(plain[1]), Number(plain[2]))) return { lat: Number(plain[1]), lng: Number(plain[2]), name: null };
  let url: URL;
  try { url = new URL(text); } catch { return null; }
  const decoded = decodeURIComponent(url.pathname + url.search + url.hash);
  const name = decoded.match(/\/place\/([^/@]+)/)?.[1]?.replaceAll('+', ' ') ?? url.searchParams.get('q')?.split(',')[0] ?? null;
  const patterns = [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /@(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&](?:q|ll|query|sll|destination)=(-?\d+\.\d+),(-?\d+\.\d+)/, /#map=\d+\/(-?\d+\.\d+)\/(-?\d+\.\d+)/, /[?&]mlat=(-?\d+\.\d+)&mlon=(-?\d+\.\d+)/];
  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (match && valid(Number(match[1]), Number(match[2]))) return { lat: Number(match[1]), lng: Number(match[2]), name: name && !/^-?\d/.test(name) ? name : null };
  }
  return null;
}
