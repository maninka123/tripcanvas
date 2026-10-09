'use client';

import { CalendarDays, Map as MapIcon, Receipt, Settings2, Ticket } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import { TripProvider, useTrip } from '@/features/trips/client/TripContext';
import type { TripAggregate, TripRole } from '@/features/trips/types';
import { AddToTripDialog } from './AddToTripDialog';
import { AssistantDrawer } from './AssistantDrawer';
import { BookingsView } from './BookingsView';
import { BudgetView } from './BudgetView';
import { DatesDialog } from './DatesDialog';
import { DetailsView } from './DetailsView';
import { EditorDrawer } from './editors/EditorDrawer';
import { ItineraryPane } from './ItineraryPane';
import { PlannerHeader } from './PlannerHeader';
import { PlannerUIProvider, usePlannerUI, type PlannerView } from './planner-state';
import { InsertSectionDialog, SaveSectionDialog } from './SectionDialogs';
import { ShareDialog } from './ShareDialog';

// The map is heavy (MapLibre + WebGL); load it after the itinerary renders.
const MapPane = dynamic(() => import('../map/MapPane').then((module) => module.MapPane), {
  ssr: false,
  loading: () => <div className="map-pane map-loading" aria-label="Loading map">Loading map…</div>,
});

export type PlannerUser = { id: string; name: string; email: string };

export function PlannerScreen({ initial, role, user, assistantAvailable }: { initial: TripAggregate; role: TripRole; user: PlannerUser; assistantAvailable: boolean }) {
  const params = useSearchParams();
  return (
    <TripProvider initial={initial} role={role}>
      <PlannerUIProvider initialDialog={params?.get('assistant') === '1' && assistantAvailable ? 'assistant' : null}>
        <Planner user={user} assistantAvailable={assistantAvailable} welcome={params?.get('welcome') === '1'} />
      </PlannerUIProvider>
    </TripProvider>
  );
}

const TABS: { id: PlannerView; label: string; icon: typeof MapIcon; mobileOnly?: boolean }[] = [
  { id: 'itinerary', label: 'Itinerary', icon: CalendarDays },
  { id: 'map', label: 'Map', icon: MapIcon, mobileOnly: true },
  { id: 'budget', label: 'Budget', icon: Receipt },
  { id: 'bookings', label: 'Bookings', icon: Ticket },
  { id: 'details', label: 'Trip', icon: Settings2 },
];

function Planner({ user, assistantAvailable, welcome }: { user: PlannerUser; assistantAvailable: boolean; welcome: boolean }) {
  const { view: trip } = useTrip();
  const ui = usePlannerUI();
  const toast = useToast();

  useEffect(() => {
    if (welcome) toast({ message: trip.destinations.length ? 'Your trip is ready. Add places to each day, or drop ideas in Ideas.' : 'Your trip is ready. Start by adding your first destination.', tone: 'success' });
    // Only on first arrival from New Trip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { document.title = `${trip.trip.name} · TripCanvas`; }, [trip.trip.name]);

  const view = ui.view;
  const showSplit = view === 'itinerary' || view === 'map';

  return (
    <div className={`planner planner-view-${view}`}>
      <PlannerHeader assistantAvailable={assistantAvailable} />
      <nav className="planner-tabs" aria-label="Trip sections">
        {TABS.filter((tab) => !tab.mobileOnly).map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className="planner-tab" aria-current={view === id || (id === 'itinerary' && view === 'map') ? 'page' : undefined} onClick={() => ui.setView(id)}>
            <Icon size={16} aria-hidden /> {label}
          </button>
        ))}
      </nav>
      <main id="main" className="planner-main">
        {showSplit ? (
          <div className="planner-split">
            <ItineraryPane />
            <MapPane />
          </div>
        ) : null}
        {view === 'budget' ? <BudgetView /> : null}
        {view === 'bookings' ? <BookingsView /> : null}
        {view === 'details' ? <DetailsView user={user} /> : null}
      </main>
      <nav className="mobile-nav planner-mobile-nav" aria-label="Trip sections">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" aria-selected={view === id} onClick={() => ui.setView(id)}><Icon size={21} aria-hidden />{label}</button>
        ))}
      </nav>
      <EditorDrawer />
      <AddToTripDialog />
      {ui.dialog === 'share' ? <ShareDialog user={user} /> : null}
      {ui.dialog === 'dates' ? <DatesDialog /> : null}
      {ui.dialog === 'assistant' ? <AssistantDrawer /> : null}
      {ui.dialog === 'section' ? <InsertSectionDialog /> : null}
      {ui.dialog === 'saveSection' ? <SaveSectionDialog /> : null}
    </div>
  );
}
