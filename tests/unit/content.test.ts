import { describe, expect, it } from 'vitest';
import { scheduleWarnings } from '@/features/itinerary/conflicts';
import { sampleTrip } from '@/features/samples/sample-trip';
import { starterSections } from '@/features/sections/starter-sections';
import { makeAggregate, makeTrip } from '@/features/trips/factory';
import { applyOperations } from '@/features/trips/reducer';
import { parseMapLink } from '@/lib/map-links';

describe('starter content', () => {
  it('ships valid starter sections with no confirmed bookings', () => {
    const sections = starterSections();
    expect(sections.map((section) => section.id)).toEqual(['starter-xian', 'starter-chengdu', 'starter-chongqing', 'starter-zhangjiajie', 'starter-guilin']);
    for (const { payload } of sections) {
      const items = [...payload.days.flatMap((day) => day.activities), ...(payload.stays ?? [])];
      expect(items.every((item) => item.bookingStatus !== 'booked' && item.bookingReference === null)).toBe(true);
    }
  });

  it('builds a 14-day sample trip whose journeys are unbooked ideas', () => {
    const { operations, name } = sampleTrip('2026-10-08');
    const empty = makeAggregate(makeTrip({ id: 'sample', name, ownerId: 'u', dayCount: 0 }));
    const { aggregate } = applyOperations(empty, operations, { now: '2026-10-08T00:00:00Z' });
    expect(aggregate.days).toHaveLength(14);
    expect(aggregate.trip.startDate).toBe('2027-01-09');
    expect(aggregate.destinations.map((destination) => destination.name)).toEqual(["Xi'an", 'Chengdu', 'Wulingyuan', 'Fenghuang', 'Guilin', 'Yangshuo']);
    const journeys = aggregate.activities.filter((activity) => activity.title.includes('→') && activity.bookingStatus === 'idea');
    expect(journeys).toHaveLength(3);
    expect(journeys.every((journey) => journey.transport?.departTime === null)).toBe(true);
    expect(scheduleWarnings(aggregate).filter((warning) => warning.level === 'conflict')).toEqual([]);
  });
});

describe('map links', () => {
  it('reads coordinates from common map links', () => {
    expect(parseMapLink('https://www.google.com/maps/place/Black+Dragon+Pool/@26.8869,100.2331,17z')).toEqual({ lat: 26.8869, lng: 100.2331, name: 'Black Dragon Pool' });
    expect(parseMapLink('https://www.openstreetmap.org/#map=17/26.88693/100.23310')).toMatchObject({ lat: 26.88693, lng: 100.2331 });
    expect(parseMapLink('26.8869, 100.2331')).toMatchObject({ lat: 26.8869, lng: 100.2331 });
    expect(parseMapLink('https://maps.app.goo.gl/abc')).toBeNull();
  });
});
