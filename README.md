# Roamly

A visual travel-planning workspace connecting itinerary, destinations, map, transport, accommodation, bookings, documents and budget.

## Local setup

Requires Node 22.13 or newer.

```bash
npm install
npm run dev
```

The Sites development server provides local D1, R2 and a test signed-in user. No external API key is required. The MapLibre journey map uses OpenStreetMap raster tiles; replace the style through the map-provider boundary before high-volume production use.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Generate a migration after schema changes with `npm run db:generate`. The initial normalized migration is in `drizzle/`. Demo data covers Japan, a European multi-country trip and an Australian road trip; Japan is sample data only.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for design decisions and [ROADMAP.md](./ROADMAP.md) for intentionally deferred work.
