import { and, eq, gt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { aiSuggestions } from '@/db/schema';
import { reviewChanges } from '@/features/assistant/proposals';
import { placeSearchProvider } from '@/services/places';
import { assistantContext, travelAssistant } from '@/services/travel-assistant';
import { authContext, serverEnv } from '@/server/context';
import { ApiError, json, readJson, route, type RouteParams } from '@/server/http';
import { requireTripRole } from '@/server/trips/access';
import { loadAggregate } from '@/server/trips/repository';

type Params = RouteParams<{ tripId: string }>;

const HOURLY_LIMIT = 20;

/**
 * Asks the assistant for proposals. Nothing is applied here: the response
 * lists reviewed changes (as validated operations) for the traveller to accept.
 */
export const POST = route<Params>('assistant.suggest', async (request, { params, requestId }) => {
  const { tripId } = await params;
  const { db, user } = await authContext();
  await requireTripRole(db, tripId, user, 'editor');
  const env = serverEnv();
  const assistant = travelAssistant(env);
  if (!assistant) throw new ApiError(503, 'unavailable', 'The AI assistant is not configured on this server. Set ANTHROPIC_API_KEY to enable it.');
  const { prompt } = await readJson(request, z.object({ prompt: z.string().trim().min(3, 'Ask a little more').max(1500) }));

  // Cost control: a per-user hourly cap, counted from the audit log.
  const since = new Date(Date.now() - 3600_000).toISOString();
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(aiSuggestions).where(and(eq(aiSuggestions.requestedBy, user.id), gt(aiSuggestions.createdAt, since)));
  if (count >= HOURLY_LIMIT) throw new ApiError(429, 'rate_limited', `You can ask the assistant ${HOURLY_LIMIT} times an hour. Please try again later.`);

  const aggregate = await loadAggregate(db, tripId);
  const reply = await assistant.suggest({ prompt, context: assistantContext(aggregate) });
  const places = placeSearchProvider(env);
  const reviewed = await reviewChanges(aggregate, reply.changes, async (name, near) => {
    try {
      const [match] = await places.search({ query: name, near, scope: 'any', limit: 1 });
      if (!match) return null;
      // A match far from the destination is more likely a namesake elsewhere.
      if (near && (Math.abs(match.lat - near.lat) > 1.5 || Math.abs(match.lng - near.lng) > 1.5)) return null;
      return { name: match.name, address: match.address, lat: match.lat, lng: match.lng, providerId: match.providerId };
    } catch {
      return null;
    }
  }, new Date().toISOString());

  const id = crypto.randomUUID();
  await db.insert(aiSuggestions).values({ id, tripId, requestedBy: user.id, prompt, reason: reply.summary.slice(0, 2000), proposedChanges: { changes: reviewed.map(({ id: changeId, description, action, error }) => ({ id: changeId, description, action, error })) }, status: 'pending' });
  return json({ suggestionId: id, summary: reply.summary, answer: reply.answer, warnings: reply.warnings, changes: reviewed, baseVersion: aggregate.trip.version }, { requestId });
});

/** Records what the traveller did with a suggestion (audit trail). */
export const PATCH = route<Params>('assistant.review', async (request, { params, requestId }) => {
  const { tripId } = await params;
  const { db, user } = await authContext();
  await requireTripRole(db, tripId, user, 'editor');
  const input = await readJson(request, z.object({ suggestionId: z.string().uuid(), status: z.enum(['applied', 'partially_applied', 'rejected']) }));
  await db.update(aiSuggestions).set({ status: input.status, updatedAt: new Date().toISOString() }).where(and(eq(aiSuggestions.id, input.suggestionId), eq(aiSuggestions.tripId, tripId)));
  return json({ ok: true }, { requestId });
});
