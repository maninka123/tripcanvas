'use client';

import { Bookmark, CalendarPlus, ExternalLink, Layers, MapPin, Trash2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { MobileNav } from '@/components/layout/MobileNav';
import { CATEGORY } from '@/components/planner/meta';
import { SectionPreview } from '@/components/planner/SectionDialogs';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState, Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Overlay';
import { useToast } from '@/components/ui/Toast';
import { useDraft } from '@/components/planner/editors/fields';
import type { LibraryPlace } from '@/features/places/library';
import type { SectionDetail, SectionSummary } from '@/features/sections/sections';
import { makeActivity } from '@/features/trips/factory';
import type { ActivityCategory, TripAggregate, TripSummary } from '@/features/trips/types';
import { api } from '@/lib/api-client';
import { mapsLink } from '@/lib/urls';
import { PlaceSearch } from './PlaceSearch';

type Tab = 'places' | 'sections';

async function sendOperations(tripId: string, operations: unknown[], label: string) {
  // The server applies these on the latest version of the trip.
  await api(`/api/trips/${tripId}/operations`, { method: 'POST', json: { mutationId: crypto.randomUUID(), baseVersion: 0, label, operations } });
}

export function SavedPlacesScreen({ user }: { user: { name: string; email: string } }) {
  const params = useSearchParams();
  const router = useRouter();
  const tab: Tab = params?.get('tab') === 'sections' ? 'sections' : 'places';
  const setTab = (next: Tab) => router.push(next === 'places' ? '/places' : '/places?tab=sections', { scroll: false });
  return (
    <>
      <AppHeader user={user} />
      <main id="main" className="page">
        <div className="page-header">
          <div className="spacer">
            <h1 className="display">Saved Places</h1>
            <p>Collect places before you know when you’ll go, and reuse days you’ve planned before.</p>
          </div>
        </div>
        <div className="segmented" role="tablist" aria-label="Saved Places" style={{ marginBottom: 'var(--space-5)' }}>
          <button type="button" role="tab" aria-selected={tab === 'places'} onClick={() => setTab('places')}><Bookmark size={15} aria-hidden /> Places</button>
          <button type="button" role="tab" aria-selected={tab === 'sections'} onClick={() => setTab('sections')}><Layers size={15} aria-hidden /> Sections</button>
        </div>
        {tab === 'places' ? <PlacesTab /> : <SectionsTab />}
      </main>
      <MobileNav />
    </>
  );
}

function PlacesTab() {
  const toast = useToast();
  const [places, setPlaces] = useState<LibraryPlace[] | null>(null);
  const [query, setQuery] = useState('');
  const [sending, setSending] = useState<LibraryPlace | null>(null);

  useEffect(() => {
    api<{ places: LibraryPlace[] }>('/api/library/places').then((data) => setPlaces(data.places)).catch(() => setPlaces([]));
  }, []);

  const save = async (place: Parameters<Parameters<typeof PlaceSearch>[0]['onSelect']>[0]) => {
    try {
      const result = await api<{ place: LibraryPlace; duplicate: boolean }>('/api/library/places', { method: 'POST', json: { id: crypto.randomUUID(), name: place.name, category: place.category, address: place.address, city: place.city, country: place.country, lat: place.lat, lng: place.lng, providerId: place.providerId } });
      if (result.duplicate) toast({ message: `${place.name} is already saved.` });
      else { setPlaces((items) => [result.place, ...(items ?? [])]); toast({ message: `Saved ${place.name}.`, tone: 'success' }); }
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Could not save the place.', tone: 'error' });
    }
  };
  const remove = async (place: LibraryPlace) => {
    setPlaces((items) => items?.filter((item) => item.id !== place.id) ?? null);
    try { await api(`/api/library/places/${place.id}`, { method: 'DELETE' }); }
    catch { toast({ message: 'Could not remove the place.', tone: 'error' }); }
  };
  const updateNotes = async (place: LibraryPlace, notes: string) => {
    try { await api(`/api/library/places/${place.id}`, { method: 'PATCH', json: { notes } }); setPlaces((items) => items?.map((item) => item.id === place.id ? { ...item, notes } : item) ?? null); }
    catch { toast({ message: 'Could not save the note.', tone: 'error' }); }
  };

  const shown = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (places ?? []).filter((place) => !text || [place.name, place.city, place.country, place.notes].some((value) => value?.toLowerCase().includes(text)));
  }, [places, query]);
  const groups = useMemo(() => {
    const map = new Map<string, LibraryPlace[]>();
    for (const place of shown) { const key = [place.city, place.country].filter(Boolean).join(', ') || 'Other places'; map.set(key, [...(map.get(key) ?? []), place]); }
    return [...map.entries()];
  }, [shown]);

  return (
    <div className="stack">
      <div className="card card-pad stack-sm">
        <strong>Save a place</strong>
        <PlaceSearch label="Search for a place to save" placeholder="Search a landmark, restaurant or address — or paste a map link" onSelect={(place) => void save(place)} />
      </div>
      {places === null ? <p className="muted">Loading…</p> : places.length === 0 ? (
        <div className="card"><EmptyState icon={<Bookmark size={24} />} title="No saved places yet" headingLevel={2}><p>Search above to start a collection. Add saved places to any trip later.</p></EmptyState></div>
      ) : (
        <>
          <input className="input" type="search" aria-label="Filter saved places" placeholder="Filter by name, city or note" value={query} onChange={(event) => setQuery(event.target.value)} style={{ maxWidth: 420 }} />
          {groups.map(([group, items]) => (
            <section key={group} aria-label={group}>
              <h2 className="trip-group-title">{group} <span>{items.length}</span></h2>
              <ul className="saved-grid">
                {items.map((place) => {
                  const Icon = CATEGORY[place.category]?.icon ?? MapPin;
                  return (
                    <li key={place.id} className="card saved-card">
                      <div className="row"><span className="place-option-icon"><Icon size={16} aria-hidden /></span><strong className="spacer truncate">{place.name}</strong>
                        <IconButton size="sm" label={`Remove ${place.name}`} onClick={() => void remove(place)}><Trash2 size={14} /></IconButton></div>
                      {place.address ? <p className="tiny subtle">{place.address}</p> : null}
                      <SavedNote value={place.notes} onSave={(notes) => void updateNotes(place, notes)} />
                      <div className="row-wrap">
                        <Button size="sm" variant="soft" icon={<CalendarPlus size={14} />} onClick={() => setSending(place)}>Add to a trip</Button>
                        {typeof place.lat === 'number' ? <a className="btn btn-sm btn-ghost" href={mapsLink({ name: place.name, lat: place.lat, lng: place.lng })} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} aria-hidden /> Map</a> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </>
      )}
      {sending ? <SendToTripDialog title={`Add ${sending.name} to a trip`} onClose={() => setSending(null)} onSend={async (trip, dayId) => {
        await sendOperations(trip.trip.id, [{ id: crypto.randomUUID(), type: 'activity.add', activity: makeActivity({ id: crypto.randomUUID(), title: sending.name, category: sending.category as ActivityCategory, place: { name: sending.name, address: sending.address, lat: sending.lat, lng: sending.lng, providerId: sending.providerId }, notes: sending.notes, url: sending.url, dayId, currency: trip.trip.currency }) }], `Add ${sending.name}`);
        return `Added ${sending.name} to ${trip.trip.name}.`;
      }} /> : null}
    </div>
  );
}

function SavedNote({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const { draft, change, flush } = useDraft(value, onSave, 900);
  return <textarea className="textarea saved-note" rows={2} aria-label="Note" placeholder="Add a note" value={draft} onChange={(event) => change(event.target.value)} onBlur={flush} />;
}

function SectionsTab() {
  const toast = useToast();
  const [sections, setSections] = useState<SectionSummary[] | null>(null);
  const [preview, setPreview] = useState<SectionDetail | null>(null);
  const [sending, setSending] = useState<SectionDetail | null>(null);
  useEffect(() => { api<{ sections: SectionSummary[] }>('/api/library/sections').then((data) => setSections(data.sections)).catch(() => setSections([])); }, []);
  const open = async (id: string) => {
    try { setPreview((await api<{ section: SectionDetail }>(`/api/library/sections/${id}`)).section); }
    catch (error) { toast({ message: error instanceof Error ? error.message : 'Could not open the section.', tone: 'error' }); }
  };
  const remove = async (section: SectionSummary) => {
    try { await api(`/api/library/sections/${section.id}`, { method: 'DELETE' }); setSections((items) => items?.filter((item) => item.id !== section.id) ?? null); }
    catch (error) { toast({ message: error instanceof Error ? error.message : 'Could not delete the section.', tone: 'error' }); }
  };
  const own = sections?.filter((section) => !section.starter) ?? [];
  const starters = sections?.filter((section) => section.starter) ?? [];
  const card = (section: SectionSummary) => (
    <li key={section.id} className="card saved-card">
      <div className="row"><Layers size={16} aria-hidden className="subtle" /><strong className="spacer">{section.name}</strong>{section.starter ? <span className="badge badge-accent">Starter</span> : <IconButton size="sm" label={`Delete ${section.name}`} onClick={() => void remove(section)}><Trash2 size={14} /></IconButton>}</div>
      <p className="small muted">{section.dayCount} days · {section.destinationNames.join(' → ')}</p>
      {section.description ? <p className="small truncate-2">{section.description}</p> : null}
      <div className="row-wrap"><Button size="sm" onClick={() => void open(section.id)}>Preview</Button></div>
    </li>
  );
  if (sections === null) return <p className="muted">Loading…</p>;
  return (
    <div className="stack">
      <p className="muted">A section is a run of days you can drop into any trip — “3 days in Kyoto”, “Chengdu long weekend”. Save one from a trip’s menu (Save days as a section).</p>
      {own.length ? <section><h2 className="trip-group-title">Your sections <span>{own.length}</span></h2><ul className="saved-grid">{own.map(card)}</ul></section> : null}
      <section><h2 className="trip-group-title">Starter sections <span>{starters.length}</span></h2><p className="small muted" style={{ marginBottom: 'var(--space-3)' }}>Ready-made China itineraries. Costs are rough estimates and nothing is booked.</p><ul className="saved-grid">{starters.map(card)}</ul></section>
      {preview ? (
        <Modal open onOpenChange={(value) => !value && setPreview(null)} size="lg" title={preview.name} description={`${preview.dayCount} days · ${preview.destinationNames.join(' → ')}`}
          footer={<><Button onClick={() => setPreview(null)}>Close</Button><Button variant="primary" icon={<CalendarPlus size={16} />} onClick={() => { setSending(preview); setPreview(null); }}>Add to a trip</Button></>}>
          {preview.description ? <p className="muted">{preview.description}</p> : null}
          <SectionPreview section={preview} />
        </Modal>
      ) : null}
      {sending ? <SendToTripDialog title={`Add “${sending.name}” to a trip`} placement="destination" onClose={() => setSending(null)} onSend={async (trip, _dayId, index) => {
        await sendOperations(trip.trip.id, [{ id: crypto.randomUUID(), type: 'section.insert', index: index ?? trip.destinations.length, section: sending.payload }], `Insert ${sending.name}`);
        return `Added ${sending.dayCount} days to ${trip.trip.name}.`;
      }} /> : null}
    </div>
  );
}

function SendToTripDialog({ title, onClose, onSend, placement = 'day' }: { title: string; onClose: () => void; onSend: (trip: TripAggregate, dayId: string | null, destinationIndex?: number) => Promise<string>; placement?: 'day' | 'destination' }) {
  const toast = useToast();
  const router = useRouter();
  const [trips, setTrips] = useState<TripSummary[] | null>(null);
  const [tripId, setTripId] = useState('');
  const [trip, setTrip] = useState<TripAggregate | null>(null);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ trips: TripSummary[] }>('/api/trips').then((data) => setTrips(data.trips.filter((item) => item.role !== 'viewer' && !item.deletedAt))).catch(() => setTrips([])); }, []);
  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    api<{ trip: TripAggregate }>(`/api/trips/${tripId}`).then((data) => { if (!cancelled) { setTrip(data.trip); setTarget(placement === 'day' ? '' : String(data.trip.destinations.length)); } }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [tripId, placement]);
  const send = async () => {
    if (!trip) return;
    setBusy(true);
    try {
      const message = await onSend(trip, placement === 'day' ? target || null : null, placement === 'destination' ? Number(target) : undefined);
      toast({ message, tone: 'success', action: { label: 'Open trip', onClick: () => router.push(`/trips/${trip.trip.id}`) } });
      onClose();
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Could not add it.', tone: 'error' });
      setBusy(false);
    }
  };
  const destinations = trip ? [...trip.destinations].sort((a, b) => a.sortOrder - b.sortOrder) : [];
  return (
    <Modal open onOpenChange={(open) => !open && onClose()} title={title}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!trip} onClick={() => void send()}>Add</Button></>}>
      {trips === null ? <p className="muted">Loading trips…</p> : trips.length === 0 ? <p className="muted">Create a trip first.</p> : (
        <Field label="Trip"><select className="select" value={tripId} onChange={(event) => { setTrip(null); setTripId(event.target.value); }}><option value="">Choose a trip…</option>{trips.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      )}
      {trip && placement === 'day' ? (
        <Field label="Where"><select className="select" value={target} onChange={(event) => setTarget(event.target.value)}><option value="">Ideas (decide later)</option>{trip.days.map((day) => <option key={day.id} value={day.id}>Day {day.number}{day.date ? ` · ${day.date}` : ''}{day.destinationId ? ` · ${trip.destinations.find((item) => item.id === day.destinationId)?.name ?? ''}` : ''}</option>)}</select></Field>
      ) : null}
      {trip && placement === 'destination' ? (
        <Field label="Insert"><select className="select" value={target} onChange={(event) => setTarget(event.target.value)}><option value="0">At the start</option>{destinations.map((destination, index) => <option key={destination.id} value={index + 1}>After {destination.name}</option>)}</select></Field>
      ) : null}
    </Modal>
  );
}
