import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { TripAggregate } from '@/features/trips/types';
import { ApiError, log } from '@/server/http';

// AI travel assistant behind a provider interface. The model never touches
// the database: it returns *proposals* in a small, flat vocabulary
// (`assistantChangeSchema`). The server converts each proposal into regular
// trip operations, validates them, dry-runs them, and geocodes any place the
// model names (model-supplied coordinates are never trusted). The user then
// reviews and applies the changes they want.

export const ASSISTANT_MODEL_DEFAULT = 'claude-opus-5-5';

export const assistantChangeSchema = z.object({
  action: z.enum([
    'add_place', 'add_note', 'move_activity', 'update_activity', 'remove_activity',
    'add_destination', 'set_destination_days', 'move_destination', 'remove_destination',
    'add_transport', 'add_stay', 'rename_day',
  ]),
  description: z.string().describe('One short sentence the traveller will read, e.g. "Add Black Dragon Pool on the morning of day 4".'),
  activityId: z.string().nullable().describe('Existing activity id for move/update/remove; otherwise null.'),
  destinationId: z.string().nullable().describe('Existing destination id when the change targets one; otherwise null.'),
  dayNumber: z.number().int().nullable().describe('Target day number (1-based). null means Ideas (unscheduled).'),
  position: z.number().int().nullable().describe('Position within the day, 0 = first. null = at the end.'),
  title: z.string().nullable(),
  placeName: z.string().nullable().describe('Name of a real place to look up on the map, e.g. "Black Dragon Pool, Lijiang".'),
  category: z.enum(['sight', 'food', 'activity', 'nature', 'shopping', 'nightlife', 'other']).nullable(),
  timeSlot: z.enum(['morning', 'afternoon', 'evening', 'anytime']).nullable(),
  startTime: z.string().nullable().describe('HH:mm, only if the traveller asked for a time.'),
  durationMinutes: z.number().int().nullable(),
  notes: z.string().nullable(),
  destinationName: z.string().nullable().describe('City or region for add_destination.'),
  country: z.string().nullable(),
  dayCount: z.number().int().nullable().describe('Days for add_destination / set_destination_days.'),
  toIndex: z.number().int().nullable().describe('New 0-based position for move_destination.'),
  transportMode: z.enum(['flight', 'train', 'bus', 'ferry', 'car', 'taxi', 'transfer', 'walk', 'bike', 'other']).nullable(),
  fromName: z.string().nullable(),
  toName: z.string().nullable(),
  stayName: z.string().nullable(),
  nights: z.number().int().nullable(),
  estimatedCost: z.number().nullable().describe('Rough estimate in the trip currency, or null. Never present as a confirmed price.'),
});
export type AssistantChange = z.infer<typeof assistantChangeSchema>;

export const assistantReplySchema = z.object({
  summary: z.string().describe('What you propose and why, in 1-3 sentences.'),
  answer: z.string().nullable().describe('A direct answer when the traveller asked a question rather than for changes.'),
  changes: z.array(assistantChangeSchema),
  warnings: z.array(z.string()).describe('Things the traveller must verify (opening hours, schedules, prices, bookings).'),
});
export type AssistantReply = z.infer<typeof assistantReplySchema>;

export interface TravelAssistantProvider {
  readonly name: string;
  suggest(input: { prompt: string; context: string }): Promise<AssistantReply>;
}

export function assistantConfigured(env: { ANTHROPIC_API_KEY?: string }): boolean {
  return !!env.ANTHROPIC_API_KEY;
}

const SYSTEM_PROMPT = `You are the planning assistant inside TripCanvas, a travel itinerary app. You propose edits to the traveller's trip; the traveller reviews every change before anything is applied.

How to respond:
- Return only changes the traveller asked for or that clearly serve their request. Use the existing ids from the trip context when you refer to activities, destinations or days.
- Propose places that really exist. Give each new place a "placeName" specific enough to find on a map (include the city). The app looks up the location itself, so do not invent coordinates, addresses, phone numbers or URLs.
- You do not have live data. Never state opening hours, timetables, prices, availability or travel times as facts. When a suggestion depends on them, say so in "warnings" (for example "Check the cable car's current opening hours"). Cost figures are rough estimates only.
- Never remove or change anything marked as booked unless the traveller explicitly asks; if a request would affect a booking, explain that in "warnings" instead.
- Prefer a realistic pace: travel time between areas, meals and rest. If the traveller asks a question (for example "which days have conflicts?"), answer it in "answer" and propose changes only if they help.
- Keep "description" short and concrete; the traveller sees it as a checklist item.`;

export class AnthropicTravelAssistant implements TravelAssistantProvider {
  readonly name = 'Anthropic Claude';
  private readonly client: Anthropic;

  constructor(apiKey: string, private readonly model: string = ASSISTANT_MODEL_DEFAULT) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });
  }

  async suggest(input: { prompt: string; context: string }): Promise<AssistantReply> {
    const started = Date.now();
    try {
      const response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: 16000,
        // On a policy decline, the API re-runs the request on Anthropic's recommended fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM_PROMPT,
        output_config: { effort: 'medium', format: betaZodOutputFormat(assistantReplySchema) },
        messages: [{ role: 'user', content: `<trip>\n${input.context}\n</trip>\n\nTraveller's request: ${input.prompt}` }],
      });
      log('info', 'assistant_call', { model: response.model, ms: Date.now() - started, stop: response.stop_reason, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens });
      if (response.stop_reason === 'refusal') throw new ApiError(422, 'invalid_request', 'The assistant could not help with that request. Try rephrasing it as a travel-planning question.');
      if (response.stop_reason === 'max_tokens') throw new ApiError(422, 'invalid_request', 'That request was too large to answer in one go. Try asking about fewer days at a time.');
      if (!response.parsed_output) throw new ApiError(502, 'provider_error', 'The assistant returned an unexpected answer. Please try again.');
      return response.parsed_output;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
        log('error', 'assistant_auth_failed', { status: error.status });
        throw new ApiError(503, 'unavailable', 'The assistant is not configured correctly on this server.');
      }
      if (error instanceof Anthropic.RateLimitError) throw new ApiError(503, 'rate_limited', 'The assistant is busy right now. Please try again in a minute.');
      if (error instanceof Anthropic.BadRequestError) {
        log('error', 'assistant_bad_request', { message: error.message });
        throw new ApiError(502, 'provider_error', 'The assistant could not process this trip. Please try again.');
      }
      if (error instanceof Anthropic.APIError) {
        log('warn', 'assistant_api_error', { status: error.status });
        throw new ApiError(502, 'provider_error', 'The assistant is unavailable right now. Please try again shortly.');
      }
      log('warn', 'assistant_unreachable', { message: error instanceof Error ? error.message : String(error) });
      throw new ApiError(502, 'provider_error', 'The assistant could not be reached. Please try again shortly.');
    }
  }
}

export function travelAssistant(env: { ANTHROPIC_API_KEY?: string; ANTHROPIC_MODEL?: string }): TravelAssistantProvider | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  return new AnthropicTravelAssistant(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL || ASSISTANT_MODEL_DEFAULT);
}

/**
 * The structured context the model sees. Deliberately minimal: no traveller
 * names or emails, no free-text notes, no documents or booking references.
 */
export function assistantContext(aggregate: TripAggregate): string {
  const { trip } = aggregate;
  const destinations = [...aggregate.destinations].sort((a, b) => a.sortOrder - b.sortOrder);
  const lines: string[] = [
    `Trip: ${trip.name}`,
    `Dates: ${trip.dateMode === 'fixed' ? `starts ${trip.startDate}, ${aggregate.days.length} days` : `flexible, ${aggregate.days.length} days`}`,
    `Travellers: ${trip.travellers}. Pace: ${trip.pace ?? 'not set'}. Interests: ${trip.interests.join(', ') || 'not set'}. Currency: ${trip.currency}. Budget: ${trip.budget ?? 'not set'}.`,
    'Destinations (in order):',
    ...destinations.map((destination, index) => `  ${index}. [${destination.id}] ${destination.name}${destination.country ? `, ${destination.country}` : ''} — days ${destination.startDay ?? '-'}–${destination.endDay ?? '-'}`),
    'Days:',
  ];
  for (const day of aggregate.days) {
    const destination = destinations.find((item) => item.id === day.destinationId);
    lines.push(`  Day ${day.number}${day.date ? ` (${day.date})` : ''} — ${destination?.name ?? 'no destination'}${day.title ? ` — "${day.title}"` : ''}`);
    for (const activity of aggregate.activities.filter((item) => item.dayId === day.id)) {
      const when = activity.kind === 'transport' ? activity.transport?.departTime : activity.startTime ?? activity.timeSlot;
      const what = activity.kind === 'transport' && activity.transport ? `${activity.transport.mode} ${activity.transport.from.name} → ${activity.transport.to.name}` : activity.title;
      lines.push(`    - [${activity.id}] ${when ?? 'anytime'} ${what}${activity.durationMinutes ? ` (${activity.durationMinutes} min)` : ''}${activity.bookingStatus === 'booked' ? ' [BOOKED]' : ''}`);
    }
    const stay = aggregate.stays.find((item) => item.startDayId === day.id);
    if (stay) lines.push(`    * Check in: ${stay.name}, ${stay.nights} nights${stay.bookingStatus === 'booked' ? ' [BOOKED]' : ''}`);
  }
  const ideas = aggregate.activities.filter((activity) => activity.dayId === null);
  if (ideas.length) lines.push('Ideas (not scheduled):', ...ideas.map((idea) => `  - [${idea.id}] ${idea.title}${idea.destinationId ? ` (${destinations.find((item) => item.id === idea.destinationId)?.name ?? ''})` : ''}`));
  return lines.join('\n');
}
