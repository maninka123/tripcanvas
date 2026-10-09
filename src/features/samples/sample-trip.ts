import { addDays, todayIso } from '@/lib/dates';
import { starterSections } from '@/features/sections/starter-sections';
import { makeActivity, makeTransport } from '@/features/trips/factory';
import { newOp, type Operation } from '@/features/trips/operations';
import type { TransportMode } from '@/features/trips/types';

// The optional sample trip offered on an empty My Trips page. It is created
// only when the user asks for it, is badged "Sample" everywhere, and is an
// ordinary trip afterwards (editable, deletable). Journeys between cities
// are left as unbooked ideas without times: we do not invent schedules.

const ROUTE: { section: string; arriveBy: TransportMode; note: string }[] = [
  { section: 'starter-xian', arriveBy: 'flight', note: '' },
  { section: 'starter-chengdu', arriveBy: 'train', note: "High-speed trains run between Xi'an North and Chengdu East. Check current timetables on 12306 before booking." },
  { section: 'starter-zhangjiajie', arriveBy: 'flight', note: 'Flights connect Chengdu with Zhangjiajie Hehua airport. Compare with rail via Changsha before booking.' },
  { section: 'starter-guilin', arriveBy: 'train', note: 'Trains link Zhangjiajie West with Guilin, usually via Changsha or Huaihua. Check current timetables before booking.' },
];

export function sampleTrip(today = todayIso()): { name: string; operations: Operation[]; coverImageUrl: string | null } {
  const sections = new Map(starterSections().map((section) => [section.id, section.payload]));
  // Start about three months out, on a Saturday.
  let startDate = addDays(today, 90);
  while (new Date(`${startDate}T00:00:00Z`).getUTCDay() !== 6) startDate = addDays(startDate, 1);

  const setDates = newOp({ type: 'trip.setDates', dateMode: 'fixed', startDate, dayCount: 1 });
  const operations: Operation[] = [setDates];
  const inserts: { op: Operation; firstDayId: string; destinationId: string; name: string }[] = [];
  let destinationCount = 0;
  ROUTE.forEach((stop) => {
    const payload = sections.get(stop.section);
    if (!payload) return;
    // Append after every destination inserted so far (a section may hold several).
    const op = newOp({ type: 'section.insert', index: destinationCount, section: payload });
    destinationCount += payload.destinations.length;
    operations.push(op);
    inserts.push({ op, firstDayId: `${op.id}:day:0`, destinationId: `${op.id}:dest:0`, name: payload.destinations[0].name });
  });
  // The placeholder day created by setDates is no longer needed.
  operations.push(newOp({ type: 'day.remove', dayId: `${setDates.id}:day:0` }));

  for (let index = 1; index < inserts.length; index += 1) {
    const from = inserts[index - 1];
    const to = inserts[index];
    const route = ROUTE[index];
    operations.push(newOp({
      type: 'activity.add',
      index: 0,
      activity: makeActivity({
        id: crypto.randomUUID(),
        title: `${route.arriveBy === 'flight' ? 'Fly' : 'Train'} ${from.name} → ${to.name}`,
        kind: 'transport',
        category: 'other',
        dayId: to.firstDayId,
        destinationId: to.destinationId,
        bookingStatus: 'idea',
        notes: route.note,
        currency: 'AUD',
        transport: makeTransport({ mode: route.arriveBy, from: { name: from.name }, to: { name: to.name }, departTimezone: 'Asia/Shanghai', arriveTimezone: 'Asia/Shanghai' }),
      }),
    }));
  }
  operations.push(newOp({ type: 'trip.update', patch: { travellers: 2, budget: 6000, pace: 'balanced', interests: ['culture', 'food', 'landscapes'], notes: 'This is a sample trip to show how TripCanvas works. Edit anything, or delete it when you are done exploring.' } }));
  const firstImage = [...sections.values()].flatMap((payload) => payload.destinations).find((destination) => destination.imageUrl)?.imageUrl ?? null;
  return { name: 'China highlights (sample)', operations, coverImageUrl: firstImage };
}
