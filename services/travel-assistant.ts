export type StructuredChange = { operation: 'create'|'update'|'move'|'delete'; entity: 'event'|'segment'|'booking'; id?: string; values?: Record<string, unknown> };
export type TravelSuggestion = { reason: string; changes: StructuredChange[]; warnings: string[] };

export interface TravelAssistantService {
  suggest(prompt: string, structuredTrip: unknown): Promise<TravelSuggestion>;
}

export class OfflineTravelAssistant implements TravelAssistantService {
  async suggest(): Promise<TravelSuggestion> {
    return { reason: 'AI suggestions are optional and no provider is configured.', changes: [], warnings: ['Connect an assistant provider to generate structured, reviewable changes.'] };
  }
}
