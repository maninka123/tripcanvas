import { addDays, timeToMinutes } from '@/lib/dates';
import type { TripAggregate } from '@/features/trips/types';

// iCalendar export (RFC 5545). Timed plans become events in the local time
// of their destination (TZID when known, floating otherwise); each
// destination and stay becomes an all-day event. Flexible-date trips have no
// calendar dates, so they cannot be exported.

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds lines longer than 75 octets, as the spec requires. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 75) {
    let cut = 74;
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 74) cut -= 1;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

const compactDate = (iso: string) => iso.replaceAll('-', '');
const localDateTime = (iso: string, minutes: number) => `${compactDate(addDays(iso, Math.floor(minutes / 1440)))}T${String(Math.floor((minutes % 1440) / 60)).padStart(2, '0')}${String(minutes % 60).padStart(2, '0')}00`;

export function tripToIcs(aggregate: TripAggregate, stamp = new Date()): string | null {
  if (aggregate.trip.dateMode !== 'fixed' || !aggregate.trip.startDate) return null;
  const dtstamp = `${stamp.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TripCanvas//Itinerary//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escapeText(aggregate.trip.name)}`];
  const event = (uid: string, fields: string[]) => lines.push('BEGIN:VEVENT', `UID:${uid}@tripcanvas`, `DTSTAMP:${dtstamp}`, ...fields, 'END:VEVENT');
  const dayById = new Map(aggregate.days.map((day) => [day.id, day]));

  for (const destination of aggregate.destinations) {
    const first = aggregate.days.find((day) => day.number === destination.startDay);
    const last = aggregate.days.find((day) => day.number === destination.endDay);
    if (!first?.date || !last?.date) continue;
    event(`dest-${destination.id}`, [`DTSTART;VALUE=DATE:${compactDate(first.date)}`, `DTEND;VALUE=DATE:${compactDate(addDays(last.date, 1))}`, `SUMMARY:${escapeText(`${destination.name}${destination.country ? `, ${destination.country}` : ''}`)}`, 'TRANSP:TRANSPARENT']);
  }
  for (const stay of aggregate.stays) {
    const start = dayById.get(stay.startDayId ?? '');
    if (!start?.date || stay.bookingStatus === 'cancelled') continue;
    event(`stay-${stay.id}`, [`DTSTART;VALUE=DATE:${compactDate(start.date)}`, `DTEND;VALUE=DATE:${compactDate(addDays(start.date, stay.nights))}`, `SUMMARY:${escapeText(`Stay: ${stay.name}`)}`, ...(stay.place?.address ? [`LOCATION:${escapeText(stay.place.address)}`] : []), 'TRANSP:TRANSPARENT']);
  }
  for (const activity of aggregate.activities) {
    const day = dayById.get(activity.dayId ?? '');
    if (!day?.date || activity.bookingStatus === 'cancelled' || activity.kind === 'note') continue;
    const destination = aggregate.destinations.find((item) => item.id === day.destinationId);
    const transport = activity.kind === 'transport' ? activity.transport : null;
    const startMinutes = timeToMinutes(transport ? transport.departTime : activity.startTime);
    const zone = transport?.departTimezone ?? destination?.timezone ?? null;
    const tz = zone ? `;TZID=${zone}` : '';
    const description = [activity.notes, activity.bookingReference ? `Booking reference: ${activity.bookingReference}` : null, activity.url].filter(Boolean).join('\n');
    const location = transport ? `${transport.from.name} → ${transport.to.name}` : activity.place?.address ?? activity.place?.name;
    const common = [`SUMMARY:${escapeText(activity.title)}`, ...(location ? [`LOCATION:${escapeText(location)}`] : []), ...(description ? [`DESCRIPTION:${escapeText(description)}`] : [])];
    if (startMinutes === null) {
      event(`act-${activity.id}`, [`DTSTART;VALUE=DATE:${compactDate(day.date)}`, `DTEND;VALUE=DATE:${compactDate(addDays(day.date, 1))}`, ...common, 'TRANSP:TRANSPARENT']);
      continue;
    }
    let endField: string;
    if (transport?.arriveTime) {
      const arriveZone = transport.arriveTimezone ?? zone;
      endField = `DTEND${arriveZone ? `;TZID=${arriveZone}` : ''}:${localDateTime(addDays(day.date, transport.arriveDayOffset), timeToMinutes(transport.arriveTime)!)}`;
    } else {
      endField = `DTEND${tz}:${localDateTime(day.date, startMinutes + (activity.durationMinutes ?? 60))}`;
    }
    event(`act-${activity.id}`, [`DTSTART${tz}:${localDateTime(day.date, startMinutes)}`, endField, ...common]);
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
