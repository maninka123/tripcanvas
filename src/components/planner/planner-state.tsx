'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

// Planner UI state. What the user is looking at lives in the URL
// (?view=…&day=…&item=…) so Back/Forward, refresh and shared links restore
// it; transient things (open dialogs) stay in React state.

export type PlannerView = 'itinerary' | 'map' | 'budget' | 'bookings' | 'details';
export type MapMode = 'trip' | 'destination' | 'day';
export type Selection = { type: 'activity' | 'stay' | 'destination'; id: string } | null;
export type Editor = { type: 'activity' | 'stay' | 'destination'; id: string } | null;
export type AddTarget = { dayId: string | null; destinationId?: string | null; index?: number; mode?: 'place' | 'note' | 'transport' | 'stay' } | null;

type PlannerUI = {
  view: PlannerView;
  setView: (view: PlannerView) => void;
  dayNumber: number | null;
  setDayNumber: (day: number | null) => void;
  mapMode: MapMode;
  setMapMode: (mode: MapMode) => void;
  selection: Selection;
  select: (selection: Selection, options?: { scroll?: boolean }) => void;
  scrollRequest: { id: string; nonce: number } | null;
  editor: Editor;
  openEditor: (editor: Editor) => void;
  addTarget: AddTarget;
  openAdd: (target: AddTarget) => void;
  dialog: 'share' | 'dates' | 'assistant' | 'section' | 'saveSection' | null;
  openDialog: (dialog: PlannerUI['dialog']) => void;
  destinationFocus: string | null;
  setDestinationFocus: (id: string | null) => void;
};

const Context = createContext<PlannerUI | null>(null);
const VIEWS: PlannerView[] = ['itinerary', 'map', 'budget', 'bookings', 'details'];

export function PlannerUIProvider({ children, initialDialog }: { children: ReactNode; initialDialog?: PlannerUI['dialog'] }) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const params = useSearchParams();
  const view = (VIEWS.includes(params?.get('view') as PlannerView) ? params!.get('view') : 'itinerary') as PlannerView;
  const dayParam = Number(params?.get('day'));
  const dayNumber = Number.isInteger(dayParam) && dayParam > 0 ? dayParam : null;
  const itemParam = params?.get('item') ?? null;
  const [mapModeState, setMapModeState] = useState<MapMode | null>(null);
  const [selectionState, setSelectionState] = useState<Selection>(null);
  const [scrollRequest, setScrollRequest] = useState<PlannerUI['scrollRequest']>(null);
  const [editor, setEditor] = useState<Editor>(itemParam ? { type: 'activity', id: itemParam } : null);
  const [addTarget, setAddTarget] = useState<AddTarget>(null);
  const [dialog, setDialog] = useState<PlannerUI['dialog']>(initialDialog ?? null);
  const [destinationFocus, setDestinationFocus] = useState<string | null>(null);

  const navigate = useCallback((changes: Record<string, string | null>, push: boolean) => {
    const next = new URLSearchParams(params?.toString() ?? '');
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key); else next.set(key, value);
    }
    next.delete('welcome');
    next.delete('assistant');
    const query = next.toString();
    const url = `${pathname}${query ? `?${query}` : ''}`;
    if (push) router.push(url, { scroll: false }); else router.replace(url, { scroll: false });
  }, [params, pathname, router]);

  const setView = useCallback((next: PlannerView) => navigate({ view: next === 'itinerary' ? null : next }, true), [navigate]);
  const setDayNumber = useCallback((day: number | null) => {
    navigate({ day: day === null ? null : String(day) }, false);
    if (day !== null) setMapModeState('day');
  }, [navigate]);
  const openEditor = useCallback((next: Editor) => {
    setEditor(next);
    navigate({ item: next?.type === 'activity' ? next.id : null }, false);
  }, [navigate]);
  const select = useCallback((next: Selection, options?: { scroll?: boolean }) => {
    setSelectionState(next);
    if (next && options?.scroll) setScrollRequest({ id: next.id, nonce: Date.now() });
  }, []);

  const mapMode: MapMode = mapModeState ?? (dayNumber ? 'day' : 'trip');

  const value = useMemo<PlannerUI>(() => ({
    view, setView, dayNumber, setDayNumber, mapMode, setMapMode: setMapModeState,
    selection: selectionState, select, scrollRequest, editor, openEditor,
    addTarget, openAdd: setAddTarget, dialog, openDialog: setDialog, destinationFocus, setDestinationFocus,
  }), [view, setView, dayNumber, setDayNumber, mapMode, selectionState, select, scrollRequest, editor, openEditor, addTarget, dialog, destinationFocus]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePlannerUI(): PlannerUI {
  const value = useContext(Context);
  if (!value) throw new Error('usePlannerUI must be used inside PlannerUIProvider');
  return value;
}
