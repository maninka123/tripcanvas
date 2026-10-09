import { describe, expect, it } from 'vitest';
import { addDays, formatDateRange, inclusiveDayCount, isIsoDate, journeyMinutes, zonedTimeToUtc } from '@/lib/dates';
import { decodePolyline, distanceKm, greatCircle } from '@/lib/geo';
import { isSafeHttpUrl } from '@/lib/urls';
import { compactRanges, scheduleWarnings } from '@/features/itinerary/conflicts';
import { budgetSummary, formatMoney } from '@/features/budget/budget';
import { planningChecklist, tripPhase } from '@/features/trips/selectors';
import { applyOperations } from '@/features/trips/reducer';
import { makeActivity, makeAggregate, makeDay, makeDestinationInput, makeExpense, makeStay, makeTransport, makeTrip } from '@/features/trips/factory';
import type { OperationInput } from '@/features/trips/operations';
import type { TripAggregate } from '@/features/trips/types';

let n = 0;
const run = (aggregate: TripAggregate, ...ops: OperationInput[]) => applyOperations(aggregate, ops.map((op) => ({ ...op, id: `t-${++n}` }) as never), { now: '2026-10-08T00:00:00Z' }).aggregate;

function base(): TripAggregate {
  const trip = makeTrip({ id: 't', name: 'Test', ownerId: 'u', dateMode: 'fixed', startDate: '2027-04-01', currency: 'AUD', budget: 1000 });
  let aggregate = makeAggregate(trip, [1, 2, 3, 4].map((number) => makeDay({ id: `d${number}`, number })));
  aggregate = run(aggregate,
    { type: 'destination.add', destination: makeDestinationInput({ id: 'sh', name: 'Shanghai', lat: 31.23, lng: 121.47 }), dayCount: 2 },
    { type: 'destination.add', destination: makeDestinationInput({ id: 'lj', name: 'Lijiang', lat: 26.87, lng: 100.23 }), dayCount: 2 },
  );
  return aggregate;
}

describe('dates', () => {
  it('validates and does calendar arithmetic across boundaries', () => {
    expect(isIsoDate('2027-02-29')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(inclusiveDayCount('2027-03-30', '2027-04-02')).toBe(4);
    expect(formatDateRange('2026-12-28', '2027-01-03')).toBe('28 Dec 2026 – 3 Jan 2027');
    expect(formatDateRange('2027-05-12', '2027-05-26')).toBe('12–26 May 2027');
    expect(formatDateRange(null, null)).toBe('Flexible dates');
  });

  it('computes journey time across time zones and the date line', () => {
    // Sydney 09:00 → Shanghai 16:30 same day (AEDT +11 in January, CST +8).
    expect(journeyMinutes({ departDate: '2027-01-10', departTime: '09:00', departTimezone: 'Australia/Sydney', arriveTime: '16:30', arriveTimezone: 'Asia/Shanghai', arriveDayOffset: 0 })).toBe(10 * 60 + 30);
    // Overnight train: depart 21:00, arrive 07:30 next day, same zone.
    expect(journeyMinutes({ departDate: '2027-04-02', departTime: '21:00', departTimezone: 'Asia/Shanghai', arriveTime: '07:30', arriveTimezone: 'Asia/Shanghai', arriveDayOffset: 1 })).toBe(10 * 60 + 30);
    // Tokyo 17:00 → Honolulu 06:00 the *same* calendar day (crosses the date line).
    expect(journeyMinutes({ departDate: '2027-05-01', departTime: '17:00', departTimezone: 'Asia/Tokyo', arriveTime: '06:00', arriveTimezone: 'Pacific/Honolulu', arriveDayOffset: 0 })).toBe(8 * 60);
    expect(zonedTimeToUtc('2027-07-01', '12:00', 'Europe/London')?.toISOString()).toBe('2027-07-01T11:00:00.000Z');
  });
});

describe('geo and urls', () => {
  it('measures distance and builds great-circle arcs', () => {
    expect(Math.round(distanceKm({ lat: 31.23, lng: 121.47 }, { lat: 26.87, lng: 100.23 }))).toBeGreaterThan(2000);
    const arc = greatCircle({ lat: 35, lng: 140 }, { lat: 21, lng: -158 });
    expect(arc[arc.length - 1][0]).toBeCloseTo(202, 0);
  });
  it('decodes polylines', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5)).toEqual([[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]]);
  });
  it('accepts only http(s) links', () => {
    expect(isSafeHttpUrl('https://example.com')).toBe(true);
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('data:text/html,hi')).toBe(false);
  });
});

describe('schedule warnings', () => {
  it('flags overlaps, late transport and implausible gaps without inventing durations', () => {
    let aggregate = base();
    aggregate = run(aggregate,
      { type: 'activity.add', activity: makeActivity({ id: 'a', title: 'Yu Garden', dayId: 'd1', startTime: '09:00', durationMinutes: 120, place: { name: 'Yu Garden', lat: 31.227, lng: 121.492 } }) },
      { type: 'activity.add', activity: makeActivity({ id: 'b', title: 'The Bund', dayId: 'd1', startTime: '10:30', durationMinutes: 60, place: { name: 'Bund', lat: 31.24, lng: 121.49 } }) },
      { type: 'activity.add', activity: makeActivity({ id: 'c', title: 'Zhujiajiao', dayId: 'd1', startTime: '11:40', place: { name: 'Zhujiajiao', lat: 31.11, lng: 121.05 } }) },
      { type: 'activity.add', activity: makeActivity({ id: 'no-duration', title: 'Lunch', dayId: 'd2', startTime: '12:00' }) },
      { type: 'activity.add', activity: makeActivity({ id: 'later', title: 'Museum', dayId: 'd2', startTime: '12:10' }) },
      { type: 'activity.add', activity: makeActivity({ id: 'flight', title: 'Fly to Lijiang', kind: 'transport', dayId: 'd3', transport: makeTransport({ mode: 'flight', from: { name: 'PVG' }, to: { name: 'LJG' }, departTime: '08:00', arriveTime: '12:00', departTimezone: 'Asia/Shanghai', arriveTimezone: 'Asia/Shanghai' }) }) },
      { type: 'activity.add', activity: makeActivity({ id: 'old-town', title: 'Old Town', dayId: 'd3', startTime: '11:00' }) },
    );
    const warnings = scheduleWarnings(aggregate);
    expect(warnings.find((warning) => warning.kind === 'overlap')?.itemIds).toEqual(['a', 'b']);
    expect(warnings.find((warning) => warning.kind === 'tight-gap')?.itemIds).toEqual(['b', 'c']);
    expect(warnings.find((warning) => warning.kind === 'transport-arrival')?.itemIds).toEqual(['flight', 'old-town']);
    // No duration on "Lunch" → no claim about an overlap with the museum.
    expect(warnings.some((warning) => warning.itemIds.includes('no-duration'))).toBe(false);
  });

  it('reports overlapping stays, uncovered nights and missing transport as info', () => {
    let aggregate = base();
    aggregate = run(aggregate,
      { type: 'stay.add', stay: makeStay({ id: 's1', name: 'Hotel A', startDayId: 'd1', nights: 2 }) },
      { type: 'stay.add', stay: makeStay({ id: 's2', name: 'Hotel B', startDayId: 'd2', nights: 1 }) },
    );
    const warnings = scheduleWarnings(aggregate);
    expect(warnings.find((warning) => warning.kind === 'stay-overlap')?.level).toBe('conflict');
    expect(warnings.find((warning) => warning.kind === 'missing-stay')?.message).toMatch(/night of day 3/);
    expect(warnings.find((warning) => warning.kind === 'missing-transport')?.message).toBe('How will you get from Shanghai to Lijiang?');
    expect(compactRanges([1, 2, 3, 5, 7, 8])).toBe('1–3, 5, 7–8');
  });
});

describe('budget', () => {
  it('aggregates by status, category and day, converting with recorded rates only', () => {
    let aggregate = base();
    aggregate = run(aggregate,
      { type: 'activity.add', activity: makeActivity({ id: 'ticket', title: 'Museum', dayId: 'd1', cost: 30, currency: 'AUD', bookingStatus: 'booked' }) },
      { type: 'activity.add', activity: makeActivity({ id: 'dinner', title: 'Dinner', category: 'food', dayId: 'd1', cost: 200, currency: 'CNY' }) },
      { type: 'activity.add', activity: makeActivity({ id: 'cancelled', title: 'Show', dayId: 'd2', cost: 99, bookingStatus: 'cancelled' }) },
      { type: 'stay.add', stay: makeStay({ id: 'hotel', name: 'Hotel', startDayId: 'd1', nights: 2, cost: 300, currency: 'AUD', bookingStatus: 'booked' }) },
      { type: 'expense.add', expense: makeExpense({ id: 'souvenir', title: 'Tea', amount: 50, currency: 'USD', category: 'shopping', status: 'paid' }) },
    );
    let summary = budgetSummary(aggregate);
    expect(summary.planned).toBe(330);
    expect(summary.missingRates).toEqual(['CNY', 'USD']);
    aggregate = run(aggregate, { type: 'rate.set', rate: { currency: 'CNY', rate: 0.21, at: '2026-10-08T00:00:00Z', source: 'manual' } });
    summary = budgetSummary(aggregate);
    expect(summary.planned).toBe(372);
    expect(summary.confirmed).toBe(330);
    expect(summary.byCategory.food.planned).toBe(42);
    expect(summary.byDay.get('d1')).toBe(30 + 42 + 150);
    expect(summary.byDay.get('d2')).toBe(150);
    expect(summary.remaining).toBe(1000 - 372);
  });

  it('does not double count an expense recorded against an activity', () => {
    let aggregate = base();
    aggregate = run(aggregate,
      { type: 'activity.add', activity: makeActivity({ id: 'tour', title: 'Tour', dayId: 'd1', cost: 100 }) },
      { type: 'expense.add', expense: makeExpense({ id: 'paid', title: 'Tour (paid)', amount: 90, activityId: 'tour', status: 'paid' }) },
    );
    expect(budgetSummary(aggregate).planned).toBe(90);
  });

  it('formats money', () => {
    expect(formatMoney(1234.5, 'AUD')).toBe('$1,235');
    expect(formatMoney(null, 'AUD')).toBe('—');
  });
});

describe('planning checklist and phase', () => {
  it('derives meaningful progress', () => {
    let aggregate = base();
    aggregate = run(aggregate,
      { type: 'stay.add', stay: makeStay({ id: 's', name: 'Hotel', startDayId: 'd1', nights: 2 }) },
      { type: 'activity.add', activity: makeActivity({ id: 'a', title: 'A', dayId: 'd1' }) },
    );
    expect(planningChecklist(aggregate)).toEqual({ hasDates: true, hasDestinations: true, nightsCovered: 2, nightsTotal: 3, connectionsCovered: 0, connectionsTotal: 1, daysPlanned: 1 });
    expect(tripPhase('2027-04-01', '2027-04-04', '2027-04-02')).toBe('travelling');
    expect(tripPhase('2027-04-01', '2027-04-04', '2027-05-02')).toBe('past');
    expect(tripPhase(null, null)).toBe('planning');
  });
});
