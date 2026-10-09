import { fetchProviderJson } from './provider-fetch';

// Short destination introductions and a photo from Wikipedia's REST API.
// Only a direct article match is used; disambiguation pages and misses
// return null so the UI shows nothing rather than a guess. Text and image
// are attributed back to the article.

export type DestinationInfo = {
  title: string;
  description: string | null;
  extract: string;
  imageUrl: string | null;
  sourceUrl: string;
  credit: string;
};

type Summary = {
  type?: string;
  title?: string;
  description?: string;
  extract?: string;
  thumbnail?: { source: string; width: number };
  originalimage?: { source: string; width: number };
  content_urls?: { desktop?: { page?: string } };
  coordinates?: { lat: number; lon: number };
};

function widen(source: string, width: number): string {
  // Wikimedia thumbnails encode their width in the path: /330px-File.jpg.
  return source.replace(/\/(\d+)px-([^/]+)$/, (_match, current: string, file: string) => `/${Math.max(Number(current), width)}px-${file}`);
}

export async function destinationInfo(title: string, options: { contact?: string; near?: { lat: number; lng: number } } = {}): Promise<DestinationInfo | null> {
  const candidates = [title];
  if (options.near) candidates.push(`${title} (city)`);
  for (const candidate of candidates) {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(candidate.replaceAll(' ', '_'))}?redirect=true`;
    let summary: Summary;
    try {
      summary = await fetchProviderJson<Summary>('Wikipedia', url, { ttlSeconds: 7 * 86_400, contact: options.contact });
    } catch {
      continue;
    }
    if (summary.type !== 'standard' || !summary.extract || !summary.content_urls?.desktop?.page) continue;
    // If we know where the destination is, reject an article about somewhere else entirely.
    if (options.near && summary.coordinates) {
      const far = Math.abs(summary.coordinates.lat - options.near.lat) > 3 || Math.abs(summary.coordinates.lon - options.near.lng) > 3;
      if (far) continue;
    }
    const thumbnail = summary.thumbnail?.source ? widen(summary.thumbnail.source, 960) : null;
    return {
      title: summary.title ?? title,
      description: summary.description ?? null,
      extract: summary.extract,
      imageUrl: thumbnail,
      sourceUrl: summary.content_urls.desktop.page,
      credit: 'Wikipedia',
    };
  }
  return null;
}
