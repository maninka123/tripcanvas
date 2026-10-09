// Warms the dev server before the tests: Vite compiles each route on first
// request, which can take longer than a test's navigation timeout on a cold
// CI runner.
export default async function globalSetup() {
  const base = process.env.BASE_URL ?? 'http://localhost:3000';
  const headers = { cookie: '__sites_local_auth=1' };
  for (const path of ['/', '/trips/new', '/places']) {
    try {
      await fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(240_000) });
    } catch {
      // A slow or failed warm-up is not fatal; the tests report real problems.
    }
  }
}
