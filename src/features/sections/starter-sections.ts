import { sectionPayloadSchema, type SectionPayload } from '@/features/trips/operations';
import data from './starter-sections.json';

// Built-in starter sections for China, available to every user in Saved
// Places → Sections. They are read-only templates: inserting one copies it
// into the trip. Place coordinates were looked up once with Photon
// (© OpenStreetMap contributors) and checked by hand; places without a
// confident match have a name but no pin. Costs are rough planning
// estimates in AUD, and no booking is implied.

export type StarterSection = { id: string; payload: SectionPayload };

let cache: StarterSection[] | null = null;

export function starterSections(): StarterSection[] {
  cache ??= (data as { id: string; payload: unknown }[]).map((entry) => ({ id: entry.id, payload: sectionPayloadSchema.parse(entry.payload) }));
  return cache;
}
