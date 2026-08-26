import { describe, expect, it } from 'vitest';
import { bookingTransitionAllowed, categoryTotals, convertAmount, dayTotal, generateDays, reorderEvents, tripTotal } from '@/lib/travel-calculations';
import { japanDays } from '@/lib/demo-data';
import { canDeleteTrip, canEditTrip, canViewTrip } from '@/lib/permissions';
import { validateDay } from '@/lib/conflicts';

describe('trip business logic',()=>{
  it('generates one inclusive day for each date',()=>expect(generateDays('2027-05-12','2027-05-26')).toHaveLength(15));
  it('rejects an inverted date range',()=>expect(()=>generateDays('2027-05-13','2027-05-12')).toThrow());
  it('aggregates day, trip and category totals',()=>{expect(dayTotal(japanDays[0])).toBe(486);expect(tripTotal(japanDays)).toBe(928);expect(categoryTotals(japanDays).Transport).toBe(252)});
  it('uses actual cost when available',()=>expect(dayTotal({...japanDays[0],events:japanDays[0].events.map((event,index)=>index===0?{...event,actualCost:200}:event)})).toBe(492));
  it('converts and rounds currencies using the persisted rate',()=>expect(convertAmount(1000,.01023)).toBe(10.23));
  it('reorders events and rewrites stable sort positions',()=>{const moved=reorderEvents(japanDays[0].events,'e-4','e-1');expect(moved.map((event)=>event.id)).toEqual(['e-4','e-1','e-2','e-3']);expect(moved.map((event)=>event.sortOrder)).toEqual([0,1,2,3])});
  it('enforces terminal booking transitions',()=>{expect(bookingTransitionAllowed('Need to Book','Booked')).toBe(true);expect(bookingTransitionAllowed('Cancelled','Paid')).toBe(false)});
  it('reports booking warnings without inventing external facts',()=>expect(validateDay(japanDays[0].events).filter((warning)=>warning.type==='booking')).toHaveLength(2));
});

describe('trip permissions',()=>{it('separates view, edit and delete rights',()=>{expect(canViewTrip('viewer')).toBe(true);expect(canEditTrip('viewer')).toBe(false);expect(canEditTrip('editor')).toBe(true);expect(canDeleteTrip('editor')).toBe(false);expect(canDeleteTrip('owner')).toBe(true)})});
