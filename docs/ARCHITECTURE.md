# Architecture

TripCanvas is a React 19 / TypeScript app on **Vinext** (the Next.js App Router API running on Vite), deployed to **Cloudflare Workers** through OpenAI Sites, with **D1** (SQLite) via **Drizzle ORM** for data and **R2** for private files. Maps use **MapLibre GL**.

## The trip is one aggregate

Everything about a trip is loaded as one object — `TripAggregate` in `src/features/trips/types.ts`:

```text
trip · destinations · days · activities (plans, transport, notes) · stays · expenses · rates · attachments · members
```

Every screen (itinerary, map, budget, bookings, Travel Mode, exports) is *derived* from it by pure functions (`features/trips/selectors.ts`, `features/budget`, `features/itinerary/conflicts.ts`), so they cannot disagree.

Key modelling decisions:

- **Destinations own blocks of days.** Days are ordered by destination, then unassigned days. Reordering destinations moves their days (and plans) with them; dates are recomputed from the trip start.
- **Plans are never silently deleted.** Shortening a destination or the trip moves affected plans to **Ideas** (`dayId = null`, destination kept) and says so.
- **Booking details live on the booked item** (activity, transport or stay). The Bookings view is a filter over them, so there is one status and one price per booking.
- **Costs keep their original currency.** Totals convert with rates recorded on the trip (with source and time); unconvertible costs are listed, never guessed.
- **Stays span nights**: a stay has a check-in day and a number of nights.

## Changes are operations

All edits are typed **operations** (`features/trips/operations.ts`, validated with Zod) such as `destination.setDays`, `activity.move`, `stay.add` or `section.insert`. One pure **reducer** (`features/trips/reducer.ts`) applies them and then **normalises** the aggregate (day numbering, dates, destination ranges, sort orders, dangling references). New entities created by an operation get ids derived from the operation id, so the result is identical wherever it runs.

The same operation language is used for:

1. **UI edits** — applied instantly in the browser (optimistic), then sent to the server.
2. **Undo/redo** — `diff.ts` compares before/after and builds an exact inverse `restore` operation.
3. **The AI assistant** — its proposals are converted into operations, validated and dry-run before the user sees them.

## Sync and persistence

```text
Browser                                   Worker (route handler)                 D1
TripSync ── POST /api/trips/:id/operations ──▶ auth + role check
  optimistic view                         load aggregate ─────────────────────▶ SELECTs
  queue (mutationId, ops)                 reducer.applyOperations
  retry with backoff                      diff before/after
  localStorage backup of unsent edits     one batch:  guard insert ───────────▶ trip_mutations
                                                      changed rows only ──────▶ trips, days, events…
                                                      version + 1
```

- **Atomic**: each mutation is one D1 batch (a transaction).
- **Idempotent**: the client's `mutationId` is the primary key of `trip_mutations`; a retried request is recognised and not applied twice.
- **Concurrency**: the first statement inserts the mutation row with `trip_id` written through `CASE WHEN version = <read version>`. If someone else wrote in between, the NOT NULL constraint fails, the batch rolls back, and the server re-applies the operations to the fresh trip. Operations express intent ("move X to day 3"), so re-applying is safe.
- **Client**: `features/trips/client/trip-sync.ts` keeps the confirmed server state plus pending mutations, rebuilds the view if the server rejects something (and tells the user), refetches when another client changed the trip, and persists unsent edits so they survive a reload.

Server code: `src/server/trips/` (`access.ts` roles, `repository.ts` load/create/mutate, `persist.ts` statements, `mapping.ts` rows ⇄ domain). The schema is in `src/db/schema.ts`; migration `0001` is purely additive and older rows load through tolerant mappers.

## Providers

External services sit behind small interfaces in `src/services/` and are called **only from the server**, with timeouts, identifying User-Agent, edge caching and per-user rate limits (`provider-fetch.ts`):

| Need | Default | Interface |
|---|---|---|
| Place search / reverse | Photon (OSM) | `PlaceSearchProvider` |
| Routing (walk, bike, drive) | Valhalla (FOSSGIS) | `RoutingProvider` |
| Destination intro + photo | Wikipedia REST | `destinationInfo()` |
| Exchange rates | ExchangeRate-API | `latestRates()` |
| AI assistant | Anthropic Claude (optional) | `TravelAssistantProvider` |
| Map tiles | OpenFreeMap vector style | `MAP_STYLE_URL` in `components/map/MapPane.tsx` |

Honesty rules: only provider results are shown; when routing is unavailable the map draws a dashed line labelled as a straight-line connection; flights are drawn as labelled arcs; schedule checks never invent travel times or opening hours.

## The assistant

`POST /api/trips/:id/assistant` sends a minimal trip summary (no names, emails, notes, references or documents) to Claude with structured output. The model answers in a small flat vocabulary (`add_place`, `move_activity`, `set_destination_days`…). The server converts each item to operations, geocodes named places itself, refuses changes to booked items, dry-runs everything and returns a reviewable list. The user applies a subset as one undoable mutation. Calls are rate-limited per user and logged in `ai_suggestions`. Without `ANTHROPIC_API_KEY` the feature is hidden and the endpoint returns 503.

## Security

- **Authentication** comes from the hosting platform's signed-in headers, which the platform sets and strips from client requests. Development uses the Sites plugin's simulated user; production builds contain no simulated users.
- **Authorization** is checked on every read and write (`requireTripRole`): owner, editor, viewer. Invitations bind to an account by email on first visit. A trip you cannot access returns 404.
- **Input validation**: every request body is parsed with Zod, sizes are capped, URLs must be http(s) before they are rendered as links, map labels are rendered by MapLibre (no HTML injection), and notes are plain text.
- **Files**: type checked by magic bytes (PDF/JPEG/PNG/WebP/GIF/HEIC), 15 MB limit, private R2 keys, served only to trip members with `nosniff`, a sandboxing CSP and no shared caching. A malware-scanning hook (`server/files.ts`) records `scan_status`.
- **Secrets** stay on the server (`types/env.d.ts` lists them).

## Front end

- `components/ui/` — accessible primitives on Radix (dialogs, drawers/bottom sheets, menus, popovers, tooltips) and a toast live region.
- `components/planner/` — planner screen, header, destination timeline, itinerary with cross-day drag and drop (dnd-kit, keyboard-accessible), editors that autosave, budget, bookings, details, sharing, assistant, sections.
- `components/map/` — one stable MapLibre instance updated in place; GeoJSON sources with clustering; data from `map-data.ts`.
- `styles/` — design tokens (`tokens.css`) and component styles; colour pairs meet WCAG AA; reduced motion respected.
- URLs carry the view, day and open plan (`?view=budget&day=3&item=…`) so Back/Forward, refresh and links work.

## Offline

Travel Mode registers a service worker (`/sw.js`, served by a route) that caches the Travel Mode page, its trip data and build assets, network-first. It works offline after one visit (verified with Playwright against a production build). Signing out clears these caches and any unsent edits. The planner itself needs a connection, but keeps unsent edits locally until it can save them.
