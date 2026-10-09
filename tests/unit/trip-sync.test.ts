import { afterEach, describe, expect, it, vi } from 'vitest';
import { TripSync } from '@/features/trips/client/trip-sync';
import { makeActivity, makeAggregate, makeDay, makeTrip } from '@/features/trips/factory';
import { newOp } from '@/features/trips/operations';
import type { TripAggregate } from '@/features/trips/types';

function aggregate(): TripAggregate {
  const trip = makeTrip({ id: 'trip', name: 'Sync', ownerId: 'u', dateMode: 'fixed', startDate: '2027-01-01', dayCount: 2, version: 3 });
  const base = makeAggregate(trip, [makeDay({ id: 'd1', number: 1, date: '2027-01-01' }), makeDay({ id: 'd2', number: 2, date: '2027-01-02' })]);
  return { ...base, activities: [makeActivity({ id: 'a', title: 'Temple', dayId: 'd1' })] };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
type Call = { mutationId: string; baseVersion: number; operations: { type: string }[] };

function fakeServer(failFirst = 0) {
  const calls: Call[] = [];
  let version = 3;
  const applied = new Set<string>();
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Call;
    calls.push(body);
    if (calls.length <= failFirst) throw new TypeError('network down');
    const duplicate = applied.has(body.mutationId);
    if (!duplicate) { applied.add(body.mutationId); version += 1; }
    return new Response(JSON.stringify({ version, rebased: false, duplicate, notices: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  return { calls, applied };
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('TripSync', () => {
  it('applies edits optimistically and confirms them with the server', async () => {
    const server = fakeServer();
    const sync = new TripSync(aggregate(), 'owner', () => undefined);
    sync.dispatch([newOp({ type: 'activity.move', activityId: 'a', dayId: 'd2', index: 0 })], { label: 'Move' });
    expect(sync.getSnapshot().view.activities[0].dayId).toBe('d2');
    expect(sync.getSnapshot().status).toBe('saving');
    await settle(); await settle();
    expect(server.calls).toHaveLength(1);
    expect(server.calls[0].baseVersion).toBe(3);
    expect(sync.getSnapshot().status).toBe('saved');
    expect(sync.hasPending).toBe(false);
  });

  it('undo and redo apply exact inverses, and each is saved', async () => {
    const server = fakeServer();
    const sync = new TripSync(aggregate(), 'owner', () => undefined);
    sync.dispatch([newOp({ type: 'activity.update', activityId: 'a', patch: { startTime: '09:30' } })], { label: 'Set time' });
    sync.dispatch([newOp({ type: 'activity.move', activityId: 'a', dayId: 'd2', index: 0 })], { label: 'Move' });
    sync.undo();
    expect(sync.getSnapshot().view.activities[0]).toMatchObject({ dayId: 'd1', startTime: '09:30' });
    sync.redo();
    expect(sync.getSnapshot().view.activities[0]).toMatchObject({ dayId: 'd2', startTime: '09:30' });
    sync.undo();
    sync.undo();
    expect(sync.getSnapshot().view.activities[0]).toMatchObject({ dayId: 'd1', startTime: null });
    expect(sync.getSnapshot().canUndo).toBe(false);
    for (let i = 0; i < 10; i += 1) await settle();
    expect(server.applied.size).toBe(6);
  });

  it('keeps edits through a network failure and retries with the same mutation id', async () => {
    vi.useFakeTimers();
    const server = fakeServer(1);
    const sync = new TripSync(aggregate(), 'owner', () => undefined);
    sync.dispatch([newOp({ type: 'activity.update', activityId: 'a', patch: { title: 'Lama Temple' } })], { label: 'Rename' });
    await vi.advanceTimersByTimeAsync(0);
    expect(sync.getSnapshot().status).toBe('offline');
    expect(sync.getSnapshot().view.activities[0].title).toBe('Lama Temple');
    await vi.advanceTimersByTimeAsync(2500);
    expect(server.calls).toHaveLength(2);
    expect(server.calls[1].mutationId).toBe(server.calls[0].mutationId);
    expect(sync.getSnapshot().status).toBe('saved');
  });

  it('merges rapid edits of one field into a single save and a single undo step', async () => {
    const server = fakeServer();
    const sync = new TripSync(aggregate(), 'owner', () => undefined);
    // Hold the first request so later edits queue behind it.
    sync.dispatch([newOp({ type: 'activity.update', activityId: 'a', patch: { notes: 'a' } })], { label: 'Notes', coalesceKey: 'a:notes' });
    sync.dispatch([newOp({ type: 'activity.update', activityId: 'a', patch: { notes: 'ab' } })], { label: 'Notes', coalesceKey: 'a:notes' });
    sync.dispatch([newOp({ type: 'activity.update', activityId: 'a', patch: { notes: 'abc' } })], { label: 'Notes', coalesceKey: 'a:notes' });
    for (let i = 0; i < 6; i += 1) await settle();
    expect(server.calls.length).toBeLessThanOrEqual(2);
    sync.undo();
    expect(sync.getSnapshot().view.activities[0].notes).toBe('');
  });

  it('refuses edits from viewers', () => {
    fakeServer();
    const messages: string[] = [];
    const sync = new TripSync(aggregate(), 'viewer', (message) => messages.push(message));
    expect(sync.dispatch([newOp({ type: 'activity.remove', activityId: 'a' })], { label: 'Delete' })).toBe(false);
    expect(messages[0]).toMatch(/view-only/);
  });
});
