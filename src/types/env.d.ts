/// <reference types="vite/client" />
// Cloudflare bindings and server-side configuration available as `env` from
// `cloudflare:workers`. Bindings are declared in .openai/hosting.json; secrets
// are set in the hosting platform (see docs/OPERATIONS.md).
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES: R2Bucket;
    /** Enables the AI assistant (Anthropic Messages API). */
    ANTHROPIC_API_KEY?: string;
    ANTHROPIC_MODEL?: string;
    /** Place search (Photon-compatible). Defaults to https://photon.komoot.io. */
    PLACES_BASE_URL?: string;
    /** Routing (Valhalla-compatible). Defaults to https://valhalla1.openstreetmap.de. */
    ROUTING_BASE_URL?: string;
    /** Contact string sent in the User-Agent to open-data providers, as their usage policies require. */
    PROVIDER_CONTACT?: string;
  }
}
