// Calendar-date helpers. Trip dates are plain ISO calendar dates (YYYY-MM-DD)
// with no time zone: "Day 3" is the same calendar date for every traveller.
// All arithmetic is done in UTC so local DST changes cannot shift a date.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_MS = 86_400_000;

export const MAX_TRIP_DAYS = 120;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isTime(value: unknown): value is string {
  return typeof value === 'string' && HHMM.test(value);
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return new Date(date.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (to − from). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Inclusive number of days between two ISO dates. */
export function inclusiveDayCount(startDate: string, endDate: string): number {
  return daysBetween(startDate, endDate) + 1;
}

export function tripEndDate(startDate: string | null, dayCount: number): string | null {
  if (!startDate || dayCount < 1) return null;
  return addDays(startDate, dayCount - 1);
}

export function dayDate(startDate: string | null, dayNumber: number): string | null {
  return startDate ? addDays(startDate, dayNumber - 1) : null;
}

export function todayIso(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function timeToMinutes(time: string | null | undefined): number | null {
  if (!time || !isTime(time)) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(total: number): string {
  const wrapped = ((Math.round(total) % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parts(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate(), weekday: date.getUTCDay() };
}

/** "Tue 12 May" */
export function formatDayLabel(isoDate: string): string {
  const { day, month, weekday } = parts(isoDate);
  return `${WEEKDAYS[weekday]} ${day} ${MONTHS[month]}`;
}

/** "12 May 2027" */
export function formatLongDate(isoDate: string): string {
  const { day, month, year } = parts(isoDate);
  return `${day} ${MONTHS[month]} ${year}`;
}

/** "12–26 May 2027", "28 Dec 2026 – 3 Jan 2027" */
export function formatDateRange(startDate: string | null, endDate: string | null): string {
  if (!startDate || !endDate) return 'Flexible dates';
  const a = parts(startDate);
  const b = parts(endDate);
  if (a.year !== b.year) return `${a.day} ${MONTHS[a.month]} ${a.year} – ${b.day} ${MONTHS[b.month]} ${b.year}`;
  if (a.month !== b.month) return `${a.day} ${MONTHS[a.month]} – ${b.day} ${MONTHS[b.month]} ${b.year}`;
  if (a.day === b.day) return `${a.day} ${MONTHS[a.month]} ${a.year}`;
  return `${a.day}–${b.day} ${MONTHS[a.month]} ${a.year}`;
}

/**
 * Offset in minutes of an IANA zone from UTC at the given instant
 * (positive east of Greenwich). Returns null for an unknown zone.
 */
export function zoneOffsetMinutes(timeZone: string, instant: Date): number | null {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const values = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
    const asUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second));
    return Math.round((asUtc - instant.getTime()) / 60_000);
  } catch {
    return null;
  }
}

/** Converts a wall-clock date and time in `timeZone` to a UTC instant. */
export function zonedTimeToUtc(isoDate: string, time: string, timeZone: string | null): Date | null {
  const minutes = timeToMinutes(time);
  if (minutes === null || !isIsoDate(isoDate)) return null;
  const naive = Date.parse(`${isoDate}T00:00:00Z`) + minutes * 60_000;
  if (!timeZone) return new Date(naive);
  // Two passes handle instants close to a DST transition.
  let offset = zoneOffsetMinutes(timeZone, new Date(naive));
  if (offset === null) return null;
  offset = zoneOffsetMinutes(timeZone, new Date(naive - offset * 60_000)) ?? offset;
  return new Date(naive - offset * 60_000);
}

/**
 * Elapsed minutes of a journey that departs and arrives in possibly different
 * time zones. Without a calendar date (flexible trips) a reference date is used,
 * which is exact except across a DST change.
 */
export function journeyMinutes(input: {
  departDate: string | null;
  departTime: string | null;
  departTimezone: string | null;
  arriveTime: string | null;
  arriveTimezone: string | null;
  arriveDayOffset: number;
}): number | null {
  if (!input.departTime || !input.arriveTime) return null;
  const departDate = input.departDate ?? '2026-01-15';
  const depart = zonedTimeToUtc(departDate, input.departTime, input.departTimezone);
  const arrive = zonedTimeToUtc(addDays(departDate, input.arriveDayOffset), input.arriveTime, input.arriveTimezone ?? input.departTimezone);
  if (!depart || !arrive) return null;
  const minutes = Math.round((arrive.getTime() - depart.getTime()) / 60_000);
  return minutes >= 0 ? minutes : null;
}

/** Short zone label such as "GMT+8" for display next to a time. */
export function zoneLabel(timeZone: string | null, isoDate: string | null): string | null {
  if (!timeZone) return null;
  const offset = zoneOffsetMinutes(timeZone, new Date(`${isoDate ?? '2026-01-15'}T12:00:00Z`));
  if (offset === null) return null;
  const sign = offset >= 0 ? '+' : '−';
  const abs = Math.abs(offset);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `GMT${sign}${hours}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`;
}
