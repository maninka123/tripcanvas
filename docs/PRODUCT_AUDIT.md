# TripCanvas — Product audit

Audit of the repository as found on 8 October 2026 (commit `59d711a`, app branded "Roamly"). Severity: **Critical** blocks the product's core promise, **High** causes data loss or serious UX/security failure, **Medium** degrades quality, **Low** is polish.

## 1. What existed

| Area | Reality |
| --- | --- |
| Stack | Vinext 1.0 beta (Next.js App Router on Vite), React 19, TypeScript, Cloudflare D1 via Drizzle, R2 binding declared, MapLibre, dnd-kit, OpenAI Sites hosting with "Sign in with ChatGPT". |
| Screens | One client component (`PlannerApp.tsx`, 53 KB, mostly single-line JSX) switching between Dashboard, Trip library, and a trip with seven tabs (Overview, Itinerary, Map, Builder, Budget, Bookings, Documents) plus a full-screen Travel Mode. No URLs: refresh always returned to the dashboard. |
| Data | `localStorage` (`roamly.planner.v1`), seeded with hard-coded demo trips (Japan, Alps, Coast) in every account. |
| Server | Five write-only route handlers (`POST /api/trips`, `DELETE /api/trips`, `POST /api/events`, `PATCH /api/events/reorder`, `POST /api/segments`). **No read endpoint existed.** |
| Schema | A well-normalised 16-table schema (trips, segments, days, events, accommodations, bookings, expenses, saved places, attachments, travellers, AI suggestions…), most tables unused. |
| Tests | One unit test file (9 tests) over budget/date helpers. No integration or E2E tests. |

## 2. Confirmed issues

### Critical
- **C1 — Nothing persisted to the server.** All client `fetch` calls were fire-and-forget with no error handling. Locally the D1 database had never been migrated (`no such table: trips`), so every write failed silently. Data lived only in one browser's `localStorage`; clearing it or switching device lost every trip.
- **C2 — No read path.** Even when writes succeeded in production, the app never loaded them back. Edits to events, notes, bookings, cover photos, renames and duplicates were never sent at all.
- **C3 — Demo data mixed with user data.** Every account started with three fictional trips, and the Overview tab showed hard-coded "Book Kyoto hotel", "8 / 12 bookings complete", "Pack light for Koyasan" regardless of trip. Travel Mode always showed Kyoto, day 7, a fixed weather card and a fixed train.

### High
- **H1 — Fake or decorative controls.** Documents "upload" kept only a file name (no bytes were stored); "Open" showed a toast. Command palette actions such as "Open Day 7" and "Find Shinkansen booking" did nothing. Budget percentages ("91% of budget", "60% of planned") were literal strings.
- **H2 — Destinations had coordinates `0,0`.** New destinations were created at latitude/longitude 0 (Gulf of Guinea) because there was no geocoding, which broke the map for every non-demo trip.
- **H3 — Misleading routes.** The map drew straight dashed lines between cities, and the Map tab claimed "High-speed rail · 3h 05m" for the first leg of any trip.
- **H4 — XSS path.** Map popups were built with `setHTML(`<strong>${segment.city}</strong>`)` from user input. Trip notes were stored as raw `contentEditable` HTML and re-injected with `dangerouslySetInnerHTML`.
- **H5 — Authorisation was owner-only and ad hoc.** Each route re-implemented the ownership check inline; the viewer/editor roles in `lib/permissions.ts` were never used, so sharing was impossible.
- **H6 — Data lost on server failure.** Optimistic updates were never reconciled; a failed request left the UI showing a state that did not exist.

### Medium
- **M1 — Fragmented information architecture.** Seven tabs duplicated the same data (Overview/Map/Builder all re-rendered the route). Itinerary and map were never visible together.
- **M2 — Monolithic, unreadable components.** Business logic (day generation, duplication, section insertion) lived inside JSX event handlers.
- **M3 — Bookings duplicated itinerary data.** `Booking` objects were a separate list from the events they described, so the same hotel could have two prices and two statuses.
- **M4 — Accommodation did not span nights.** A hotel was a single event on one day.
- **M5 — Currency.** Amounts were assumed to be AUD regardless of trip currency; display conversion used live rates without recording which rate was used.
- **M6 — Accessibility.** Clickable `<article>` cards (not focusable), dialogs without focus trapping, colour-only booking status dots, 10–11 px text in places.
- **M7 — Tile usage.** Raw `tile.openstreetmap.org` tiles in production contravene the OSMF tile usage policy for an app.
- **M8 — Tooling.** The project requires Node ≥ 22.13; `tsc --noEmit` failed on a stale `.next/types` include; no local migration command existed.

### Low
- **L1 — Branding.** The repository is TripCanvas but the UI, metadata and storage keys said Roamly.
- **L2 — Repository clutter.** Untracked `output/`, `tmp/`, `.playwright-cli/` artefacts, a committed `tsconfig.tsbuildinfo`-style build cache, root-level type shims.
- **L3 — Lint warnings.** Four warnings (unused state, `<img>`, React Compiler skip on `watch()`).

## 3. Decisions taken

1. **Keep the stack** (Vinext, D1, Drizzle, MapLibre, dnd-kit). Nothing here justifies a framework migration.
2. **Server is the source of truth.** A trip is loaded as one aggregate (`GET /api/trips/:id`) and changed only through typed, validated *operations* (`POST /api/trips/:id/operations`). The same pure reducer runs on the client (optimistic UI) and on the server (authoritative), and the server persists the resulting diff in one D1 batch (atomic) guarded by a trip version and an idempotency key.
3. **One operation language** serves UI edits, undo (inverse operations computed from the diff) and the AI assistant (proposals are operations the user reviews).
4. **Bookings are properties of the thing booked** (activity, transport, stay). The Bookings view is derived; the old `bookings` table is retained but unused.
5. **Four areas**: My Trips, Trip Planner (itinerary + map side by side, with Budget / Bookings / Details), Saved Places (places and reusable sections), Travel Mode.
6. **Honest providers.** Place search (Photon/OSM), routing (Valhalla/OSM), destination summaries (Wikipedia REST), map tiles (OpenFreeMap) behind replaceable server-side interfaces; every result is attributed and nothing is invented when a provider has no answer. Straight-line connections are labelled "approximate"; flights are drawn as labelled air arcs.
7. **Demo content is opt-in.** A sample trip is created only when the user presses "Explore a sample trip", and it is clearly badged.

## 4. Implementation priorities

1. Persistence foundation: migration, aggregate load, operations endpoint, permissions, tests (C1, C2, H5, H6).
2. Unified planner: destinations timeline, day list, activity editing, cross-day drag and drop, Ideas, map sync (M1, M2, H2, H3).
3. Logistics: transport with time zones, multi-night stays, conflict detection (M3, M4).
4. Budget with recorded rates, derived bookings, private R2 documents (H1, M5).
5. Saved Places, reusable sections, sharing, Travel Mode, exports, AI review workflow.
6. Hardening: XSS fixes (H4), accessibility (M6), tile provider (M7), E2E tests, docs, repository tidy (L1–L3).

Progress against these is tracked in [IMPLEMENTATION_PROGRESS.md](./IMPLEMENTATION_PROGRESS.md).
