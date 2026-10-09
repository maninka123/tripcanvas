import { sectionPayloadSchema, type SectionPayload } from '@/features/trips/operations';
import type { TripAggregate } from '@/features/trips/types';

// Reusable sections ("3 days in Kyoto"). A section is a snapshot of one or
// more consecutive destinations with their days, plans and stays, stripped of
// trip-specific identifiers so it can be inserted into any trip.

export type SectionSummary = {
  id: string;
  name: string;
  description: string | null;
  dayCount: number;
  destinationNames: string[];
  coverImageUrl: string | null;
  starter: boolean;
  updatedAt: string | null;
};

export type SectionDetail = SectionSummary & { payload: SectionPayload };

export function sectionFromTrip(aggregate: TripAggregate, destinationIds: string[], name: string, description: string | null = null): SectionPayload {
  const ordered = [...aggregate.destinations].sort((a, b) => a.sortOrder - b.sortOrder).filter((destination) => destinationIds.includes(destination.id));
  if (!ordered.length) throw new Error('Choose at least one destination.');
  const destinationIndex = new Map(ordered.map((destination, index) => [destination.id, index]));
  const days = aggregate.days.filter((day) => day.destinationId && destinationIndex.has(day.destinationId));
  const dayIndex = new Map(days.map((day, index) => [day.id, index]));
  const payload: SectionPayload = {
    name,
    description,
    destinations: ordered.map(({ id: _id, sortOrder: _sortOrder, startDay: _startDay, endDay: _endDay, ...fields }) => { void _id; void _sortOrder; void _startDay; void _endDay; return fields; }),
    days: days.map((day) => ({
      destinationIndex: destinationIndex.get(day.destinationId!)!,
      title: day.title,
      notes: day.notes,
      activities: aggregate.activities
        .filter((activity) => activity.dayId === day.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(({ id: _id, dayId: _dayId, destinationId: _destinationId, sortOrder: _sortOrder, ...fields }) => { void _id; void _dayId; void _destinationId; void _sortOrder; return { ...fields, bookingStatus: fields.bookingStatus === 'booked' ? 'planned' as const : fields.bookingStatus, bookingReference: null }; }),
    })),
    stays: aggregate.stays
      .filter((stay) => stay.startDayId && dayIndex.has(stay.startDayId))
      .map(({ id: _id, startDayId, destinationId: _destinationId, ...fields }) => { void _id; void _destinationId; return { ...fields, bookingStatus: fields.bookingStatus === 'booked' ? 'planned' as const : fields.bookingStatus, bookingReference: null, startDayIndex: dayIndex.get(startDayId!)! }; }),
  };
  return sectionPayloadSchema.parse(payload);
}

export function summarizeSection(id: string, payload: SectionPayload, options: { starter: boolean; updatedAt: string | null }): SectionSummary {
  return {
    id,
    name: payload.name,
    description: payload.description ?? null,
    dayCount: payload.days.length,
    destinationNames: payload.destinations.map((destination) => destination.name),
    coverImageUrl: payload.destinations.find((destination) => destination.imageUrl)?.imageUrl ?? null,
    starter: options.starter,
    updatedAt: options.updatedAt,
  };
}
