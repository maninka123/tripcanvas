import { addDays, format as formatDate } from 'date-fns';
import type { Segment, SectionTrip, Trip, TripDay } from './types';

// Splices a reusable SectionTrip's days into a full trip right after `afterDayNumber`
// (0 = insert at the very start). Every day after the insertion point is renumbered
// and its date recalculated from the trip's start date, so the trip stays internally
// consistent no matter where the section lands.
export function insertSectionTrip(trip: Trip, days: TripDay[], segments: Segment[], section: SectionTrip, afterDayNumber: number): { trip: Trip; days: TripDay[]; segments: Segment[] } {
  const insertCount = section.days.length;
  const startDate = new Date(`${trip.startDate}T00:00:00`);
  const idPrefix = `${trip.id}-ins-${Date.now()}`;
  const dayLabel = (number: number) => formatDate(addDays(startDate, number - 1), 'EEEE, d MMM');

  const segmentIdMap = new Map(section.segments.map((segment, index) => [segment.id, `${idPrefix}-seg-${index}`]));
  const insertedSegments: Segment[] = section.segments.map((segment) => ({
    ...segment,
    id: segmentIdMap.get(segment.id)!,
    startDay: afterDayNumber + segment.startDay,
    endDay: afterDayNumber + segment.endDay,
  }));

  const insertedDays: TripDay[] = section.days.map((day, index) => {
    const number = afterDayNumber + index + 1;
    const id = `${idPrefix}-day-${number}`;
    return { ...day, id, number, date: dayLabel(number), segmentId: segmentIdMap.get(day.segmentId) ?? day.segmentId, events: day.events.map((event) => ({ ...event, id: crypto.randomUUID(), dayId: id })) };
  });

  const before = days.filter((day) => day.number <= afterDayNumber);
  const after = days.filter((day) => day.number > afterDayNumber).map((day) => { const number = day.number + insertCount; return { ...day, number, date: dayLabel(number) }; });
  const shiftedSegments = segments.map((segment) => segment.startDay > afterDayNumber ? { ...segment, startDay: segment.startDay + insertCount, endDay: segment.endDay + insertCount } : segment);

  const newDuration = trip.duration + insertCount;
  const newEndDate = formatDate(addDays(startDate, newDuration - 1), 'yyyy-MM-dd');

  return {
    trip: { ...trip, duration: newDuration, endDate: newEndDate, dates: `${trip.startDate} → ${newEndDate}` },
    days: [...before, ...insertedDays, ...after],
    segments: [...shiftedSegments, ...insertedSegments],
  };
}
