# Operations

How TripCanvas is configured, deployed, monitored and recovered.

## Environments

| Environment | How it runs | Data |
|---|---|---|
| Local development | `npm run dev` (Vinext + Cloudflare Vite plugin, Miniflare) | Local D1/R2 under `node_modules/.cache/tripcanvas/state`; reset with `npm run db:reset` |
| Production-like local check | `npm run build`, then `npx wrangler dev --config dist/server/wrangler.json --persist-to node_modules/.cache/tripcanvas/state --port 4399` | Same local state. There is no sign-in service locally, so requests must carry the platform's authenticated-user headers (see `tests/e2e/offline.spec.ts`) |
| Production | OpenAI Sites on Cloudflare Workers (`.openai/hosting.json`: D1 binding `DB`, R2 binding `FILES`) | Platform-managed D1 and R2 |

Use a separate Sites project (and therefore separate D1/R2 and secrets) for staging. Never point a test environment at production credentials.

## Configuration

Secrets are set in the hosting platform, never committed. All are optional; the app runs without them.

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Enables the AI assistant (Claude via the official SDK, model `claude-opus-5-5` with server-side refusal fallback). Without it the assistant UI is hidden and the endpoint returns 503. |
| `ANTHROPIC_MODEL` | Override the assistant model. |
| `PLACES_BASE_URL` | A Photon-compatible place search server (default `https://photon.komoot.io`). |
| `ROUTING_BASE_URL` | A Valhalla-compatible routing server (default `https://valhalla1.openstreetmap.de`). |
| `PROVIDER_CONTACT` | Contact URL/email sent in the User-Agent to open-data providers, as their policies require. |

For local development put these in `.dev.vars` (git-ignored). See `.env.example`.

## Providers

The defaults are free public services with fair-use policies. They are fine for development and small deployments; for real traffic:

- **Map tiles** — OpenFreeMap allows production use without a key; consider a paid or self-hosted style for an SLA. Change `MAP_STYLE_URL` in `src/components/map/MapPane.tsx`. Do not switch to `tile.openstreetmap.org`, whose policy forbids app use.
- **Place search** — self-host Photon or implement `PlaceSearchProvider` for a commercial geocoder (MapTiler, Stadia, Mapbox, Google Places). Respect each provider's caching terms.
- **Routing** — self-host Valhalla or use a commercial router behind `RoutingProvider`. Public transport routing is not provided; the UI labels non-routed connections as approximate.
- **Wikipedia** — summaries are cached for a week at the edge; keep attribution.
- **Exchange rates** — reference only; the trip stores the rate actually used.

Provider calls are cached with the Workers Cache API and rate-limited per user per isolate (`src/services/provider-fetch.ts`). For heavy traffic add a Workers Rate Limiting binding.

## Database migrations

Migrations live in `drizzle/` and are copied into every build (`dist/.openai/drizzle`) for the platform to apply.

1. Change `src/db/schema.ts`.
2. `npm run db:generate` — review the SQL. **Only additive changes** in a single release (new tables, nullable or defaulted columns). Drizzle sometimes proposes table rebuilds; if it does, check the previous snapshot and rewrite the migration.
3. `npm run db:migrate` to apply locally; `npm test` runs the integration suite against a fresh database built from all migrations.
4. Deploy. Old and new app versions must both work against the migrated schema during rollout, so remove columns only in a later release after nothing reads them.

## Deployment

CI (`.github/workflows/ci.yml`) runs typecheck, lint, unit and integration tests, the production build, and the Playwright journeys. Deploy only from a green `main`:

1. Merge to `main`; wait for CI.
2. Publish through the Sites deployment (it runs `npm run build` and applies new migrations).
3. Smoke-test: open My Trips, open a trip, add and remove a plan, open Travel Mode.

**Rollback**: redeploy the previous build. Because migrations are additive, the previous version keeps working with the newer schema. Do not roll back migrations by hand.

## Monitoring

- Every API response carries `x-request-id`. Route handlers log one JSON line per request (`route`, `status`, `ms`, `requestId`) and structured errors (`unhandled_error`, `provider_failed`, `provider_unreachable`, `assistant_*`). Enable Workers Logs/Logpush to search them.
- Logs never include trip content, booking references, documents or emails.
- Watch for: rising 5xx on `trips.operations`, `provider_*` warnings (provider outages or rate limits), and 409s (heavy concurrent editing).

## Backups and data

- D1 provides point-in-time restore (Time Travel) for 30 days; export regularly with `wrangler d1 export` for longer retention.
- R2 objects are private; enable bucket versioning or lifecycle copies if documents must be recoverable.
- Deleting a trip moves it to *Recently deleted* for 30 days, then it is purged (rows cascade). R2 files of purged trips should be removed by a scheduled job — **not yet implemented** (see the roadmap).
- Personal data collected: the platform user id, email and display name, plus what users type into trips. No analytics or tracking.

## Security checklist for releases

- New routes use `route()` + `authContext()` + `requireTripRole()` and validate input with Zod.
- Never render user-supplied HTML; links go through `safeHref`.
- Uploaded file types are checked by content, not by name.
- Keys stay server-side; nothing secret is exposed to the client bundle.
