import { expect, type APIRequestContext, type Page } from '@playwright/test';

// Shared steps. Place search and routing go to free public services, so the
// tests replace them with fixed, realistic responses (contract mocks).

export const LIJIANG = { lat: 26.8721, lng: 100.2299 };

const PLACES: Record<string, object[]> = {
  lijiang: [{ providerId: 'osm:R3060853', name: 'Lijiang', kind: 'city', category: 'other', isLocality: true, address: 'Yunnan, China', city: 'Lijiang', region: 'Yunnan', country: 'China', countryCode: 'CN', lat: LIJIANG.lat, lng: LIJIANG.lng, timezone: 'Asia/Shanghai' }],
  chengdu: [{ providerId: 'osm:R2110264', name: 'Chengdu', kind: 'city', category: 'other', isLocality: true, address: 'Sichuan, China', city: 'Chengdu', region: 'Sichuan', country: 'China', countryCode: 'CN', lat: 30.6598, lng: 104.0633, timezone: 'Asia/Shanghai' }],
  'black dragon': [{ providerId: 'osm:N551241157', name: 'Black Dragon Pool', kind: 'attraction', category: 'sight', isLocality: false, address: 'Lijiang, Yunnan, China', city: 'Lijiang', region: 'Yunnan', country: 'China', countryCode: 'CN', lat: 26.8869, lng: 100.2331, timezone: 'Asia/Shanghai' }],
  'old town': [{ providerId: 'osm:W123', name: 'Old Town of Lijiang', kind: 'attraction', category: 'sight', isLocality: false, address: 'Gucheng, Lijiang, China', city: 'Lijiang', region: 'Yunnan', country: 'China', countryCode: 'CN', lat: 26.8721, lng: 100.2343, timezone: 'Asia/Shanghai' }],
  hotel: [{ providerId: 'osm:N999', name: 'Old Town Courtyard Hotel', kind: 'hotel', category: 'other', isLocality: false, address: 'Wuyi Street, Lijiang, China', city: 'Lijiang', region: 'Yunnan', country: 'China', countryCode: 'CN', lat: 26.8712, lng: 100.2352, timezone: 'Asia/Shanghai' }],
};

export async function mockProviders(page: Page) {
  await page.route('**/api/places/search?**', async (route) => {
    const q = new URL(route.request().url()).searchParams.get('q')!.toLowerCase();
    const key = Object.keys(PLACES).find((name) => q.includes(name));
    await route.fulfill({ json: { results: key ? PLACES[key] : [], attribution: 'Test data' } });
  });
  await page.route('**/api/places/info?**', (route) => route.fulfill({ json: { info: null } }));
  await page.route('**/api/routes', (route) => route.fulfill({ json: { mode: 'walk', provider: 'Test', attribution: 'Test routing', legs: [{ coordinates: [[100.2343, 26.8721], [100.2331, 26.8869]], distanceKm: 1.9, durationMinutes: 26 }] } }));
}

/** Navigates and waits until React has hydrated, so clicks and typing are handled. */
export async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForSelector('html[data-ready="true"]', { timeout: 90_000 });
}

export async function reload(page: Page) {
  await page.reload();
  await page.waitForSelector('html[data-ready="true"]', { timeout: 90_000 });
}

export async function signIn(page: Page) {
  await page.goto('/signin-with-chatgpt?return_to=/');
  await expect(page).toHaveURL(/\/$/);
}

type Seed = { name: string; startDate?: string; dayCount: number; destinations?: { name: string; lat: number; lng: number; dayCount: number }[] };

/** Creates a trip through the public API (as the signed-in user) and returns its id. */
export async function createTrip(request: APIRequestContext, seed: Seed): Promise<string> {
  const id = crypto.randomUUID();
  const response = await request.post('/api/trips', {
    data: {
      id, name: seed.name, currency: 'AUD', dateMode: seed.startDate ? 'fixed' : 'flexible', startDate: seed.startDate ?? null, dayCount: seed.dayCount,
      destinations: (seed.destinations ?? []).map((destination) => ({ id: crypto.randomUUID(), name: destination.name, country: 'China', countryCode: 'CN', lat: destination.lat, lng: destination.lng, timezone: 'Asia/Shanghai', description: null, imageUrl: null, imageCredit: null, providerId: null, dayCount: destination.dayCount })),
    },
  });
  expect(response.status()).toBe(201);
  return id;
}

export async function addActivities(request: APIRequestContext, tripId: string, activities: { title: string; day: number; lat?: number; lng?: number; startTime?: string }[]) {
  const trip = await (await request.get(`/api/trips/${tripId}`)).json();
  const operations = activities.map((activity) => ({
    id: crypto.randomUUID(), type: 'activity.add',
    activity: {
      id: crypto.randomUUID(), dayId: trip.trip.days[activity.day - 1].id, destinationId: null, kind: 'place', category: 'sight', title: activity.title, timeSlot: 'anytime',
      startTime: activity.startTime ?? null, durationMinutes: null, place: activity.lat ? { name: activity.title, address: null, lat: activity.lat, lng: activity.lng, providerId: null } : null,
      notes: '', url: null, imageUrl: null, cost: null, currency: 'AUD', bookingStatus: 'none', bookingReference: null, transport: null,
    },
  }));
  const response = await request.post(`/api/trips/${tripId}/operations`, { data: { mutationId: crypto.randomUUID(), baseVersion: trip.trip.trip.version, operations } });
  expect(response.status()).toBe(200);
}

export async function waitSaved(page: Page) {
  await expect(page.locator('.save-indicator.is-saved')).toBeVisible({ timeout: 30_000 });
}

export function dayCard(page: Page, number: number) {
  return page.locator('li.day').filter({ has: page.locator('.day-badge strong', { hasText: new RegExp(`^${number}$`) }) });
}
