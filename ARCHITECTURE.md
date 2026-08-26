# Roamly architecture

Roamly is a Vinext/React/TypeScript Sites application. UI state is optimistic, while authenticated writes go through server routes to Cloudflare D1. Private file bytes belong in R2; only metadata and object keys belong in D1.

The normalized schema keeps trips, days, events, segments, locations, route legs, bookings, links, expenses, accommodation, saved places, attachments and travellers independent. The itinerary is the source of truth; map, budget, booking and Travel Mode are derived views.

Authorization is server-side. Every mutation resolves the ChatGPT user and verifies trip ownership before writing. The schema also supports editor/viewer traveller roles for the next collaboration phase.

`MapProvider` isolates geocoding and routing. The current map uses MapLibre with OpenStreetMap tiles and manually stored routes, so planning works without a paid routing API. `TravelAssistantService` returns structured suggestions for review; no assistant is needed for core planning.

Currency conversion stores original amount/currency, converted amount, rate and rate timestamp. Attachments are private by default and should be served through short-lived signed access paths.
