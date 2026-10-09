import { expect, test } from '@playwright/test';

// Travel Mode offline behaviour needs production assets (the service worker
// only caches hashed build files), so this runs against a production build:
//   npm run build && npx wrangler dev --config dist/server/wrangler.json --persist-to node_modules/.cache/tripcanvas/state --port 4399
//   PROD_URL=http://127.0.0.1:4399 PROD_TRIP=<trip id> npm run test:e2e -- offline
// Locally there is no sign-in service, so the test sends the platform's
// authenticated-user headers itself (production strips client copies).

const PROD_URL = process.env.PROD_URL;
const TRIP = process.env.PROD_TRIP;

test.skip(!PROD_URL || !TRIP, 'Set PROD_URL and PROD_TRIP to run against a production build.');

test.use({ extraHTTPHeaders: { 'oai-authenticated-user-id': 'local_seedy', 'oai-authenticated-user-email': 'seedy@sites.test' } });

test('Travel Mode keeps working offline after one visit', async ({ page, context }) => {
  await page.goto(`${PROD_URL}/trips/${TRIP}/travel`);
  await page.waitForSelector('html[data-ready="true"]');
  await expect(page.locator('.travel-day h1')).toBeVisible();
  const heading = await page.locator('.travel-day h1').textContent();
  // Wait until the service worker controls the page and has cached the page, its data and its assets.
  await expect.poll(() => page.evaluate(async () => {
    if (!navigator.serviceWorker.controller) return 'no worker';
    const names = await caches.keys();
    const count = async (prefix: string) => { const name = names.find((item) => item.startsWith(prefix)); return name ? (await (await caches.open(name)).keys()).length : 0; };
    const scripts = performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/_next/static/')).length;
    return (await count('tc-pages-')) >= 2 && (await count('tc-assets-')) >= scripts ? 'ready' : 'caching';
  }), { timeout: 30_000 }).toBe('ready');

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.travel-day h1')).toHaveText(heading ?? '');
  await expect(page.getByText(/You’re offline/)).toBeVisible();
  await context.setOffline(false);
});
