import { api, ApiRequestError } from '@/lib/api-client';
import { inverseOperation } from '../diff';
import type { Operation } from '../operations';
import { applyOperations, OperationError } from '../reducer';
import type { TripAggregate, TripRole } from '../types';

// Client sync engine for one open trip.
//
// - `confirmed` is the last state the server acknowledged.
// - `pending` mutations are applied on top for an instant, optimistic `view`.
// - Mutations are sent one at a time, in order, with a stable mutation id,
//   so retries after a network failure can never apply twice.
// - Unsent mutations are kept in localStorage and replayed after a reload.
// - If the server rejects a mutation, it is dropped, the view is rebuilt
//   from confirmed state, and the user is told why.
// - Undo/redo apply exact inverse operations computed from state diffs.

export type SaveStatus = 'saved' | 'saving' | 'offline' | 'error';

type Pending = { id: string; operations: Operation[]; label: string; coalesceKey?: string; source: 'user' | 'undo' | 'assistant'; sending?: boolean };
type HistoryEntry = { label: string; operation: Operation };

export type TripSyncSnapshot = {
  view: TripAggregate;
  role: TripRole;
  status: SaveStatus;
  lastError: string | null;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
};

export type Notify = (message: string, tone?: 'info' | 'success' | 'error', action?: { label: string; onClick: () => void }) => void;

const storageKey = (tripId: string) => `tripcanvas.pending.${tripId}`;
const now = () => new Date().toISOString();

export class TripSync {
  private confirmed: TripAggregate;
  private pending: Pending[] = [];
  private view: TripAggregate;
  private role: TripRole;
  private status: SaveStatus = 'saved';
  private lastError: string | null = null;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private listeners = new Set<() => void>();
  private snapshot: TripSyncSnapshot;
  private flushing = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 2000;
  private refreshing: Promise<void> | null = null;
  private disposed = false;

  constructor(initial: TripAggregate, role: TripRole, private readonly notify: Notify) {
    this.confirmed = initial;
    this.view = initial;
    this.role = role;
    this.restorePending();
    this.snapshot = this.buildSnapshot();
    if (this.pending.length) void this.flush();
  }

  // ---- subscription (useSyncExternalStore) ----
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private emit() {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): TripSyncSnapshot {
    return {
      view: this.view,
      role: this.role,
      status: this.status,
      lastError: this.lastError,
      canUndo: this.undoStack.length > 0 && this.role !== 'viewer',
      canRedo: this.redoStack.length > 0 && this.role !== 'viewer',
      undoLabel: this.undoStack.at(-1)?.label ?? null,
      redoLabel: this.redoStack.at(-1)?.label ?? null,
    };
  }

  get tripId() { return this.confirmed.trip.id; }
  get hasPending() { return this.pending.length > 0; }

  // ---- editing ----

  /**
   * Applies operations immediately and queues them for the server.
   * Returns false (and explains why) if they cannot be applied.
   * `coalesceKey` merges rapid edits of the same field into one save.
   */
  dispatch(operations: Operation[], options: { label: string; undoable?: boolean; coalesceKey?: string; source?: Pending['source']; quiet?: boolean } = { label: 'Edit' }): boolean {
    if (this.role === 'viewer') { this.notify('You have view-only access to this trip.', 'error'); return false; }
    const before = this.view;
    let result;
    try {
      result = applyOperations(before, operations, { now: now() });
    } catch (error) {
      this.notify(error instanceof OperationError ? error.message : 'That change could not be applied.', 'error');
      return false;
    }
    const inverse = inverseOperation(before, result.aggregate);
    if (!inverse) return true;
    this.view = result.aggregate;

    const last = this.pending.at(-1);
    if (options.coalesceKey && last && !last.sending && last.coalesceKey === options.coalesceKey) {
      last.operations.push(...operations);
    } else {
      this.pending.push({ id: crypto.randomUUID(), operations: [...operations], label: options.label, coalesceKey: options.coalesceKey, source: options.source ?? 'user' });
    }

    if (options.undoable !== false) {
      const top = this.undoStack.at(-1);
      // Typing into one field becomes a single undo step.
      if (!(options.coalesceKey && top && (top as HistoryEntry & { key?: string }).key === options.coalesceKey)) {
        this.undoStack.push(Object.assign({ label: options.label, operation: inverse }, { key: options.coalesceKey }));
        if (this.undoStack.length > 100) this.undoStack.shift();
      }
      this.redoStack = [];
    }
    if (!options.quiet) for (const notice of result.notices) this.notify(notice, 'info');
    this.persistPending();
    this.status = 'saving';
    this.emit();
    void this.flush();
    return true;
  }

  undo() {
    const entry = this.undoStack.pop();
    if (!entry) return;
    const before = this.view;
    if (!this.dispatch([entry.operation], { label: `Undo ${entry.label.toLowerCase()}`, undoable: false, source: 'undo', quiet: true })) return;
    const redo = inverseOperation(before, this.view);
    if (redo) this.redoStack.push({ label: entry.label, operation: redo });
    this.notify(`Undid: ${entry.label}`, 'info');
    this.emit();
  }

  redo() {
    const entry = this.redoStack.pop();
    if (!entry) return;
    const before = this.view;
    if (!this.dispatch([entry.operation], { label: entry.label, undoable: false, source: 'undo', quiet: true })) return;
    const undo = inverseOperation(before, this.view);
    if (undo) this.undoStack.push({ label: entry.label, operation: undo });
    this.emit();
  }

  // ---- server sync ----

  private async flush() {
    if (this.flushing || this.disposed) return;
    this.flushing = true;
    try {
      while (this.pending.length && !this.disposed) {
        const mutation = this.pending[0];
        mutation.sending = true;
        try {
          const outcome = await api<{ version: number; rebased: boolean; duplicate: boolean }>(`/api/trips/${this.tripId}/operations`, {
            method: 'POST',
            json: { mutationId: mutation.id, baseVersion: this.confirmed.trip.version, operations: mutation.operations, label: mutation.label, source: mutation.source },
          });
          this.pending.shift();
          const expected = this.confirmed.trip.version + 1;
          try {
            this.confirmed = { ...applyOperations(this.confirmed, mutation.operations, { now: now() }).aggregate };
          } catch {
            // Fall back to the server's state below.
          }
          this.confirmed = { ...this.confirmed, trip: { ...this.confirmed.trip, version: outcome.version } };
          this.retryDelay = 2000;
          this.lastError = null;
          this.persistPending();
          if (outcome.rebased || outcome.duplicate || outcome.version !== expected) await this.refresh();
        } catch (error) {
          mutation.sending = false;
          if (error instanceof ApiRequestError && error.retryable) {
            this.status = error.status === 0 ? 'offline' : 'error';
            this.lastError = error.message;
            this.emit();
            this.scheduleRetry();
            return;
          }
          // Rejected: drop it, rebuild the view, and tell the user.
          this.pending.shift();
          this.persistPending();
          this.lastError = error instanceof Error ? error.message : 'A change could not be saved.';
          this.notify(`${mutation.label} wasn't saved: ${this.lastError}`, 'error');
          this.rebuildView();
          if (error instanceof ApiRequestError && error.status === 401) { this.status = 'error'; this.emit(); return; }
          await this.refresh();
        }
      }
      this.status = 'saved';
      this.emit();
    } finally {
      this.flushing = false;
    }
  }

  private scheduleRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => { this.retryTimer = null; void this.flush(); }, this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, 30_000);
  }

  /** Try pending saves again now (e.g. when the browser comes back online). */
  retryNow() {
    this.retryDelay = 2000;
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    void this.flush();
  }

  private rebuildView() {
    let view = this.confirmed;
    const kept: Pending[] = [];
    for (const mutation of this.pending) {
      try {
        view = applyOperations(view, mutation.operations, { now: now() }).aggregate;
        kept.push(mutation);
      } catch {
        this.notify(`${mutation.label} conflicted with another change and was discarded.`, 'error');
      }
    }
    this.pending = kept;
    this.view = view;
    this.persistPending();
    this.emit();
  }

  /** Reloads the trip from the server (picks up collaborators' changes). */
  refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      try {
        const data = await api<{ trip: TripAggregate; role: TripRole }>(`/api/trips/${this.tripId}`);
        if (this.disposed) return;
        const changed = data.trip.trip.version !== this.confirmed.trip.version || data.role !== this.role;
        this.confirmed = data.trip;
        this.role = data.role;
        if (changed || this.pending.length) this.rebuildView();
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 404) this.notify('This trip is no longer available to you.', 'error');
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  /** Applies a server-side change made outside the operation queue (files, members). */
  async reload() {
    await this.refresh();
    this.emit();
  }

  private persistPending() {
    if (typeof window === 'undefined') return;
    try {
      const unsent = this.pending.map(({ id, operations, label, source }) => ({ id, operations, label, source }));
      if (unsent.length) localStorage.setItem(storageKey(this.tripId), JSON.stringify(unsent));
      else localStorage.removeItem(storageKey(this.tripId));
    } catch {
      // Storage unavailable (private mode): edits still save while the page stays open.
    }
  }

  private restorePending() {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(storageKey(this.tripId));
      if (!raw) return;
      const saved = JSON.parse(raw) as Pending[];
      // Mutation ids make replay safe: anything that already reached the server is skipped there.
      this.pending = saved;
      this.rebuildView();
      if (this.pending.length) this.status = 'saving';
    } catch {
      try { localStorage.removeItem(storageKey(this.tripId)); } catch { /* storage unavailable */ }
    }
  }

  dispose() {
    this.disposed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.listeners.clear();
  }
}
