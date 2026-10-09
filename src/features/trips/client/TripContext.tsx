'use client';

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useToast } from '@/components/ui/Toast';
import { newOp, type Operation, type OperationInput } from '../operations';
import type { TripAggregate, TripRole } from '../types';
import { TripSync, type TripSyncSnapshot } from './trip-sync';

type TripContextValue = TripSyncSnapshot & {
  sync: TripSync;
  canEdit: boolean;
  /** Build operations from inputs (ids added) and apply them. */
  run: (inputs: OperationInput | OperationInput[], options: { label: string; coalesceKey?: string; undoable?: boolean }) => boolean;
  apply: (operations: Operation[], options: { label: string; coalesceKey?: string; undoable?: boolean; source?: 'user' | 'assistant' }) => boolean;
};

const TripContext = createContext<TripContextValue | null>(null);

export function TripProvider({ initial, role, children }: { initial: TripAggregate; role: TripRole; children: ReactNode }) {
  const toast = useToast();
  const [sync] = useState(() => new TripSync(initial, role, (message, tone, action) => toast({ message, tone, action })));
  const snapshot = useSyncExternalStore(sync.subscribe, sync.getSnapshot, sync.getSnapshot);

  useEffect(() => {
    const onFocus = () => { if (!sync.hasPending) void sync.refresh(); };
    const onOnline = () => sync.retryNow();
    const onBeforeUnload = (event: BeforeUnloadEvent) => { if (sync.hasPending) { event.preventDefault(); } };
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible' && !sync.hasPending) void sync.refresh(); }, 45_000);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [sync]);

  useEffect(() => () => sync.dispose(), [sync]);

  // Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z, except while typing in a field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) sync.redo(); else sync.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sync]);

  const value = useMemo<TripContextValue>(() => ({
    ...snapshot,
    sync,
    canEdit: snapshot.role !== 'viewer',
    run: (inputs, options) => sync.dispatch((Array.isArray(inputs) ? inputs : [inputs]).map((input) => newOp(input)), options),
    apply: (operations, options) => sync.dispatch(operations, options),
  }), [snapshot, sync]);

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip(): TripContextValue {
  const context = useContext(TripContext);
  if (!context) throw new Error('useTrip must be used inside TripProvider');
  return context;
}
