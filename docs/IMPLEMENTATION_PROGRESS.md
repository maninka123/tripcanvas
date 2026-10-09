# Implementation progress

Status of the TripCanvas redesign (October 2026). "Verified" means exercised by the tests listed at the end.

## Done and verified

| Area | Notes |
|---|---|
| Server persistence | Aggregate load; typed operations; one pure reducer on client and server; atomic D1 batches; idempotent mutation ids; version guard with automatic rebase; additive migration `0001`. |
| Permissions | Owner/editor/viewer enforced on every route; email invitations; 404 for no access. |
| My Trips | Upcoming / planning / past groups, search, filters, sample badge, shared badge, planning facts (stays, transport), rename, duplicate, change cover, archive, delete with undo + 30-day restore, leave shared trip. Opt-in sample trip. |
| New trip | Where → when → how; flexible dates; optional details; retry-safe creation. |
| Planner | Itinerary and map side by side; destination timeline with days per destination, reorder, remove, add transport between stops; day strip; Ideas; cross-day drag and drop (pointer + keyboard) and menu alternatives; autosave with saved/saving/offline/error states; undo/redo; deep links (`?view`, `?day`, `?item`). |
| Editors | Plans, transport (time zones, overnight), stays (nights, contact, times), destinations; attachments. |
| Map | OpenFreeMap vector tiles; trip/destination/day modes; clustering; real routes (Valhalla) with labelled fallback; flight arcs; selection sync both ways. |
| Scheduling checks | Overlaps, late arrivals, implausible gaps, busy days, double-booked nights, missing stays, missing connections, destinations without days. |
| Budget | Planned vs confirmed, budget meter, by category, by day (chart + table), extra expenses, recorded exchange rates with reference-rate fetch. |
| Bookings & documents | Derived bookings view; private R2 documents with type checks and safe serving. |
| Saved Places & sections | Saved places library with notes; add to any trip/day; save destinations as sections; five starter China sections; insert at any destination boundary. |
| Sharing | Invite, change role, remove, copy link. |
| Travel Mode | Today / preview, up next, transport, tonight's stay (call, email, directions, copy), tickets, notes; offline after one visit. |
| Exports | PDF itinerary, `.ics` calendar, print styles. |
| Assistant | Structured proposals reviewed before applying; server-side validation, geocoding and dry-run; rate limit; audit log; hidden when not configured. |
| Accessibility | Semantic landmarks, skip link, labelled controls, focus-managed dialogs, keyboard drag and drop, non-colour status labels, reduced motion, AA colour tokens. |
| Repository | Source under `src/`, docs under `docs/`, local state under `node_modules/.cache`, Roamly → TripCanvas. |

## Tests

| Suite | Count | What it covers |
|---|---|---|
| `tests/unit/reducer.test.ts` | 18 | Day allocation, reorder, shrink/grow, stays following destinations, date changes across years, cross-day moves, sections, exact undo |
| `tests/unit/logic.test.ts` | 11 | Dates and time zones (incl. the date line), geo, URL safety, schedule checks, budget aggregation and currencies, planning facts |
| `tests/unit/content.test.ts` | 3 | Starter sections valid with no bookings; sample trip builds; map-link parsing |
| `tests/unit/trip-sync.test.ts` | 5 | Optimistic sync, undo/redo, retry with same mutation id, coalescing, viewer refusal |
| `tests/integration/trips.test.ts` | 13 | Real D1 (Miniflare): create/read, every entity round-trips, renumbering, idempotency, rebase, concurrent writers, rollback, permissions, soft delete |
| `tests/e2e/journeys.spec.ts` | 7 | A first trip · B edit, move, undo/redo · C map sync · D stay + booking + private file + anonymous denied · F failed saves retried, no duplicates · Travel Mode, ICS, dashboard delete/undo · G drag and drop |
| `tests/e2e/mobile.spec.ts` | 1 | E phone viewport: no horizontal scroll, day navigation, map tab, add and edit in bottom sheet |
| `tests/e2e/offline.spec.ts` | 1 | Travel Mode offline against a production build (runs when `PROD_URL` is set) |

Last run: typecheck clean, lint clean (0 warnings), 50 unit/integration passing, 8 end-to-end passing, production build succeeds.

## Known limitations

- The AI provider is implemented with the official SDK but was **not called with a real key** during this work (none was available); its validation and review flow are covered by code paths, not by a live test.
- Opening-hours checks need a data source (see roadmap).
- Starter content: 43 of 64 starter places have verified coordinates; the rest show "No location" rather than a guessed pin.
- Free public providers have fair-use limits (see Operations).
- Real-time collaboration is refresh-based (on focus and every 45 s), not push.
- Purging R2 files of permanently deleted trips is not automated yet.
