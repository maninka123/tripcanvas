import { describe, expect, it } from 'vitest';
import { applyOperations, OperationError } from '@/features/trips/reducer';
import { inverseOperation } from '@/features/trips/diff';
import { makeActivity, makeAggregate, makeDay, makeDestinationInput, makeStay, makeTrip } from '@/features/trips/factory';
import { operationSchema, type Operation, type OperationInput } from '@/features/trips/operations';
import type { TripAggregate } from '@/features/trips/types';

let counter = 0;
const op = (input: OperationInput): Operation => operationSchema.parse({ ...input, id: `op-${++counter}` });
const ctx = { now: '2026-10-08T00:00:00.000Z' };
const run = (aggregate: TripAggregate, ...ops: OperationInput[]) => applyOperations(aggregate, ops.map(op), ctx);

function chinaTrip(): TripAggregate {
  const trip = makeTrip({ id: 'trip-1', name: 'China', ownerId: 'u1', dateMode: 'fixed', startDate: '2027-04-01', dayCount: 12 });
  const days = Array.from({ length: 12 }, (_, index) => makeDay({ id: `day-${index + 1}`, number: index + 1 }));
  let aggregate = makeAggregate(trip, days);
  const cities: [string, number][] = [['Shanghai', 3], ['Lijiang', 3], ['Chengdu', 2], ['Zhangjiajie', 2], ['Guangzhou', 2]];
  for (const [name, dayCount] of cities) {
    aggregate = run(aggregate, { type: 'destination.add', destination: makeDestinationInput({ id: name.toLowerCase(), name, country: 'China' }), dayCount }).aggregate;
  }
  return aggregate;
}

const daysOf = (aggregate: TripAggregate, destinationId: string) => aggregate.days.filter((day) => day.destinationId === destinationId).map((day) => day.number);

describe('destinations and days', () => {
  it('allocates unassigned days to destinations in order and dates them', () => {
    const aggregate = chinaTrip();
    expect(aggregate.days).toHaveLength(12);
    expect(daysOf(aggregate, 'shanghai')).toEqual([1, 2, 3]);
    expect(daysOf(aggregate, 'lijiang')).toEqual([4, 5, 6]);
    expect(daysOf(aggregate, 'guangzhou')).toEqual([11, 12]);
    expect(aggregate.days[0].date).toBe('2027-04-01');
    expect(aggregate.days[11].date).toBe('2027-04-12');
    expect(aggregate.destinations.map((destination) => [destination.startDay, destination.endDay])).toEqual([[1, 3], [4, 6], [7, 8], [9, 10], [11, 12]]);
  });

  it('extends the trip when destinations need more days than are free', () => {
    const { aggregate, notices } = run(chinaTrip(), { type: 'destination.add', destination: makeDestinationInput({ id: 'xian', name: "Xi'an" }), dayCount: 2 });
    expect(aggregate.trip.dayCount).toBe(14);
    expect(daysOf(aggregate, 'xian')).toEqual([13, 14]);
    expect(notices.join(' ')).toMatch(/extended by 2 days/);
  });

  it('moves a destination with its days and activities', () => {
    let aggregate = chinaTrip();
    const chengduDay = aggregate.days.find((day) => day.destinationId === 'chengdu')!;
    aggregate = run(aggregate, { type: 'activity.add', activity: makeActivity({ id: 'panda', title: 'Panda base', dayId: chengduDay.id }) }).aggregate;
    aggregate = run(aggregate, { type: 'destination.move', destinationId: 'chengdu', toIndex: 1 }).aggregate;
    expect(aggregate.destinations.map((destination) => destination.id)).toEqual(['shanghai', 'chengdu', 'lijiang', 'zhangjiajie', 'guangzhou']);
    expect(daysOf(aggregate, 'chengdu')).toEqual([4, 5]);
    const panda = aggregate.activities.find((activity) => activity.id === 'panda')!;
    expect(panda.dayId).toBe(chengduDay.id);
    expect(aggregate.days.find((day) => day.id === panda.dayId)!.number).toBe(4);
    expect(aggregate.days.find((day) => day.id === panda.dayId)!.date).toBe('2027-04-04');
  });

  it('shrinking a destination never deletes plans and keeps fixed dates', () => {
    let aggregate = chinaTrip();
    const lastShanghaiDay = aggregate.days.find((day) => day.number === 3)!;
    aggregate = run(aggregate, { type: 'activity.add', activity: makeActivity({ id: 'bund', title: 'The Bund', dayId: lastShanghaiDay.id }) }).aggregate;
    const result = run(aggregate, { type: 'destination.setDays', destinationId: 'shanghai', dayCount: 2 });
    expect(result.aggregate.trip.dayCount).toBe(12);
    expect(daysOf(result.aggregate, 'shanghai')).toEqual([1, 2]);
    expect(daysOf(result.aggregate, 'lijiang')).toEqual([3, 4, 5]);
    const bund = result.aggregate.activities.find((activity) => activity.id === 'bund')!;
    expect(bund.dayId).toBeNull();
    expect(bund.destinationId).toBe('shanghai');
    expect(result.aggregate.days[11].destinationId).toBeNull();
    expect(result.notices.join(' ')).toMatch(/moved to Ideas/);
  });

  it('growing a destination reclaims a free day before extending the trip', () => {
    let aggregate = run(chinaTrip(), { type: 'destination.setDays', destinationId: 'shanghai', dayCount: 2 }).aggregate;
    aggregate = run(aggregate, { type: 'destination.setDays', destinationId: 'lijiang', dayCount: 4 }).aggregate;
    expect(aggregate.trip.dayCount).toBe(12);
    expect(daysOf(aggregate, 'lijiang')).toEqual([3, 4, 5, 6]);
  });

  it('extends a stay that ran to the end of its destination', () => {
    let aggregate = chinaTrip();
    aggregate = run(aggregate, { type: 'stay.add', stay: makeStay({ id: 'hotel', name: 'Old Town Inn', destinationId: 'lijiang', startDayId: aggregate.days[3].id, nights: 3 }) }).aggregate;
    aggregate = run(aggregate, { type: 'destination.setDays', destinationId: 'lijiang', dayCount: 4 }).aggregate;
    expect(aggregate.stays[0].nights).toBe(4);
    aggregate = run(aggregate, { type: 'destination.setDays', destinationId: 'lijiang', dayCount: 2 }).aggregate;
    expect(aggregate.stays[0].nights).toBe(2);
  });

  it('removing a destination keeps its days as unassigned days', () => {
    const aggregate = run(chinaTrip(), { type: 'destination.remove', destinationId: 'lijiang' }).aggregate;
    expect(aggregate.trip.dayCount).toBe(12);
    expect(aggregate.days.filter((day) => day.destinationId === null)).toHaveLength(3);
    expect(daysOf(aggregate, 'chengdu')).toEqual([4, 5]);
  });

  it('shortening trip dates moves plans from removed days into Ideas', () => {
    let aggregate = chinaTrip();
    aggregate = run(aggregate, { type: 'activity.add', activity: makeActivity({ id: 'canton', title: 'Canton Tower', dayId: aggregate.days[11].id }) }).aggregate;
    const result = run(aggregate, { type: 'trip.setDates', dateMode: 'fixed', startDate: '2027-04-01', dayCount: 10 });
    expect(result.aggregate.days).toHaveLength(10);
    expect(result.aggregate.activities[0].dayId).toBeNull();
    expect(result.aggregate.activities[0].destinationId).toBe('guangzhou');
    expect(result.notices.join(' ')).toMatch(/Removed 2 days/);
  });

  it('switching to flexible dates clears calendar dates but keeps day numbers', () => {
    const aggregate = run(chinaTrip(), { type: 'trip.setDates', dateMode: 'flexible', startDate: null, dayCount: 12 }).aggregate;
    expect(aggregate.days.every((day) => day.date === null)).toBe(true);
    expect(aggregate.days.map((day) => day.number)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
  });

  it('handles a trip that crosses a year boundary', () => {
    const aggregate = run(chinaTrip(), { type: 'trip.setDates', dateMode: 'fixed', startDate: '2026-12-28', dayCount: 12 }).aggregate;
    expect(aggregate.days[3].date).toBe('2026-12-31');
    expect(aggregate.days[4].date).toBe('2027-01-01');
  });
});

describe('activities', () => {
  it('reorders within a day and moves across days with stable sort orders', () => {
    let aggregate = chinaTrip();
    const [d1, d2] = aggregate.days;
    aggregate = run(aggregate,
      { type: 'activity.add', activity: makeActivity({ id: 'a', title: 'A', dayId: d1.id }) },
      { type: 'activity.add', activity: makeActivity({ id: 'b', title: 'B', dayId: d1.id }) },
      { type: 'activity.add', activity: makeActivity({ id: 'c', title: 'C', dayId: d1.id }) },
    ).aggregate;
    aggregate = run(aggregate, { type: 'activity.move', activityId: 'c', dayId: d1.id, index: 0 }).aggregate;
    expect(aggregate.activities.filter((activity) => activity.dayId === d1.id).map((activity) => activity.id)).toEqual(['c', 'a', 'b']);
    aggregate = run(aggregate, { type: 'activity.move', activityId: 'a', dayId: d2.id, index: 0 }).aggregate;
    expect(aggregate.activities.filter((activity) => activity.dayId === d1.id).map((activity) => [activity.id, activity.sortOrder])).toEqual([['c', 0], ['b', 1]]);
    expect(aggregate.activities.find((activity) => activity.id === 'a')).toMatchObject({ dayId: d2.id, sortOrder: 0 });
  });

  it('moves an activity to Ideas and back, keeping its destination', () => {
    let aggregate = chinaTrip();
    const lijiangDay = aggregate.days.find((day) => day.destinationId === 'lijiang')!;
    aggregate = run(aggregate, { type: 'activity.add', activity: makeActivity({ id: 'pool', title: 'Black Dragon Pool', dayId: lijiangDay.id }) }).aggregate;
    aggregate = run(aggregate, { type: 'activity.move', activityId: 'pool', dayId: null, index: 0 }).aggregate;
    expect(aggregate.activities[0]).toMatchObject({ dayId: null, destinationId: 'lijiang' });
  });

  it('inserts at a given position', () => {
    let aggregate = chinaTrip();
    const day = aggregate.days[0];
    aggregate = run(aggregate,
      { type: 'activity.add', activity: makeActivity({ id: 'a', title: 'A', dayId: day.id }) },
      { type: 'activity.add', activity: makeActivity({ id: 'b', title: 'B', dayId: day.id }) },
      { type: 'activity.add', activity: makeActivity({ id: 'x', title: 'X', dayId: day.id }), index: 1 },
    ).aggregate;
    expect(aggregate.activities.map((activity) => activity.id)).toEqual(['a', 'x', 'b']);
  });

  it('rejects references to missing days', () => {
    expect(() => run(chinaTrip(), { type: 'activity.add', activity: makeActivity({ id: 'z', title: 'Z', dayId: 'nope' }) })).toThrow(OperationError);
    expect(() => run(chinaTrip(), { type: 'activity.update', activityId: 'missing', patch: { title: 'x' } })).toThrow(/not found/);
  });

  it('requires transport details for transport', () => {
    expect(() => run(chinaTrip(), { type: 'activity.add', activity: makeActivity({ id: 't', title: 'Train', kind: 'transport', dayId: null }) })).toThrow(/origin/);
  });

  it('removing a day moves its plans to Ideas', () => {
    let aggregate = chinaTrip();
    aggregate = run(aggregate, { type: 'activity.add', activity: makeActivity({ id: 'a', title: 'A', dayId: aggregate.days[0].id }) }).aggregate;
    const result = run(aggregate, { type: 'day.remove', dayId: aggregate.days[0].id });
    expect(result.aggregate.days).toHaveLength(11);
    expect(result.aggregate.activities[0].dayId).toBeNull();
  });
});

describe('sections', () => {
  it('inserts a reusable section between destinations without carrying bookings over', () => {
    const { aggregate, notices } = run(chinaTrip(), {
      type: 'section.insert',
      index: 1,
      section: {
        name: 'Two days in Hangzhou',
        destinations: [{ ...makeDestinationInput({ id: 'ignored', name: 'Hangzhou', country: 'China' }) }].map(({ id: _id, ...rest }) => { void _id; return rest; }),
        days: [
          { destinationIndex: 0, title: 'West Lake', notes: '', activities: [{ ...makeActivity({ id: 'n/a', title: 'Boat on West Lake', bookingStatus: 'booked', bookingReference: 'ABC' }) }].map(({ id: _i, dayId: _d, destinationId: _x, sortOrder: _s, ...rest }) => { void _i; void _d; void _x; void _s; return rest; }) },
          { destinationIndex: 0, title: 'Tea villages', notes: '', activities: [] },
        ],
      },
    });
    expect(aggregate.trip.dayCount).toBe(14);
    expect(aggregate.destinations.map((destination) => destination.name)).toEqual(['Shanghai', 'Hangzhou', 'Lijiang', 'Chengdu', 'Zhangjiajie', 'Guangzhou']);
    const hangzhou = aggregate.destinations[1];
    expect([hangzhou.startDay, hangzhou.endDay]).toEqual([4, 5]);
    const boat = aggregate.activities.find((activity) => activity.title === 'Boat on West Lake')!;
    expect(boat).toMatchObject({ bookingStatus: 'planned', bookingReference: null });
    expect(notices[0]).toMatch(/Two days in Hangzhou/);
  });
});

describe('undo', () => {
  it('produces an inverse that restores the previous aggregate exactly', () => {
    let before = chinaTrip();
    before = run(before, { type: 'activity.add', activity: makeActivity({ id: 'a', title: 'A', dayId: before.days[3].id, cost: 20 }) }).aggregate;
    const operations: OperationInput[][] = [
      [{ type: 'destination.move', destinationId: 'guangzhou', toIndex: 0 }],
      [{ type: 'destination.setDays', destinationId: 'lijiang', dayCount: 1 }],
      [{ type: 'destination.remove', destinationId: 'chengdu' }],
      [{ type: 'trip.setDates', dateMode: 'fixed', startDate: '2027-05-01', dayCount: 8 }],
      [{ type: 'trip.update', patch: { name: 'Renamed', archived: true } }],
    ];
    for (const batch of operations) {
      const after = run(before, ...batch).aggregate;
      const inverse = inverseOperation(before, after, 'undo-1')!;
      expect(inverse).not.toBeNull();
      expect(operationSchema.safeParse(inverse).success).toBe(true);
      const restored = applyOperations(after, [inverse], ctx).aggregate;
      expect(restored.days).toEqual(before.days);
      expect(restored.destinations).toEqual(before.destinations);
      expect(restored.activities).toEqual(before.activities);
      expect(restored.trip).toEqual(before.trip);
    }
  });
});
