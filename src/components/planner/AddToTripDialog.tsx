'use client';

import { BedDouble, Bookmark, MapPin, PenLine, StickyNote, TrainFront } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PlaceSearch, type PlaceResult } from '@/components/places/PlaceSearch';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Overlay';
import { useToast } from '@/components/ui/Toast';
import type { LibraryPlace } from '@/features/places/library';
import { placeRefFrom } from '@/features/places/convert';
import { useTrip } from '@/features/trips/client/TripContext';
import { makeActivity, makeStay, makeTransport } from '@/features/trips/factory';
import { connections } from '@/features/trips/selectors';
import type { BookingStatus, TransportMode } from '@/features/trips/types';
import { api } from '@/lib/api-client';
import { BOOKING, TRANSPORT } from './meta';
import { usePlannerUI, type AddTarget } from './planner-state';

type Mode = NonNullable<NonNullable<AddTarget>['mode']>;

export function AddToTripDialog() {
  const ui = usePlannerUI();
  const target = ui.addTarget;
  const [mode, setMode] = useState<Mode>(target?.mode ?? 'place');
  const [lastTarget, setLastTarget] = useState(target);
  if (target !== lastTarget) { setLastTarget(target); setMode(target?.mode ?? 'place'); }
  if (!target) return null;
  const close = () => ui.openAdd(null);
  const titles: Record<Mode, string> = { place: 'Add a place', note: 'Add a note', transport: 'Add transport', stay: 'Add accommodation' };
  return (
    <Modal open onOpenChange={(open) => !open && close()} title={titles[mode]} size="lg">
      <div className="segmented add-modes" role="tablist" aria-label="What to add">
        {([['place', 'Place', MapPin], ['note', 'Note', StickyNote], ['transport', 'Transport', TrainFront], ['stay', 'Stay', BedDouble]] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => setMode(id)}><Icon size={15} aria-hidden /> {label}</button>
        ))}
      </div>
      {mode === 'place' ? <PlaceForm target={target} onDone={close} /> : null}
      {mode === 'note' ? <NoteForm target={target} onDone={close} /> : null}
      {mode === 'transport' ? <TransportForm target={target} onDone={close} /> : null}
      {mode === 'stay' ? <StayForm target={target} onDone={close} /> : null}
    </Modal>
  );
}

function useTargetContext(target: NonNullable<AddTarget>) {
  const { view: aggregate } = useTrip();
  const day = aggregate.days.find((item) => item.id === target.dayId) ?? null;
  const destinationId = day?.destinationId ?? target.destinationId ?? null;
  const destination = aggregate.destinations.find((item) => item.id === destinationId) ?? null;
  const near = destination && typeof destination.lat === 'number' && typeof destination.lng === 'number' ? { lat: destination.lat, lng: destination.lng } : null;
  const where = day ? `Day ${day.number}${destination ? ` · ${destination.name}` : ''}` : `Ideas${destination ? ` · ${destination.name}` : ''}`;
  return { aggregate, day, destination, near, where };
}

function PlaceForm({ target, onDone }: { target: NonNullable<AddTarget>; onDone: () => void }) {
  const { run } = useTrip();
  const ui = usePlannerUI();
  const toast = useToast();
  const { aggregate, day, destination, near, where } = useTargetContext(target);
  const [tab, setTab] = useState<'search' | 'saved'>('search');
  const [saved, setSaved] = useState<LibraryPlace[] | null>(null);
  const [alsoSave, setAlsoSave] = useState(false);

  useEffect(() => {
    if (tab !== 'saved' || saved) return;
    api<{ places: LibraryPlace[] }>('/api/library/places').then((data) => setSaved(data.places)).catch(() => setSaved([]));
  }, [tab, saved]);

  const add = (input: { title: string; category: Parameters<typeof makeActivity>[0]['category']; place: Parameters<typeof makeActivity>[0]['place']; notes?: string; url?: string | null }) => {
    const id = crypto.randomUUID();
    const ok = run({
      type: 'activity.add',
      index: target.index,
      activity: makeActivity({ id, title: input.title, category: input.category, place: input.place, notes: input.notes ?? '', url: input.url ?? null, dayId: day?.id ?? null, destinationId: day ? null : destination?.id ?? null, currency: aggregate.trip.currency }),
    }, { label: `Add ${input.title}` });
    if (!ok) return;
    onDone();
    ui.select({ type: 'activity', id }, { scroll: true });
    toast({ message: `Added “${input.title}” to ${where}.`, tone: 'success', action: { label: 'Edit', onClick: () => ui.openEditor({ type: 'activity', id }) } });
  };

  const fromSearch = (place: PlaceResult) => {
    add({ title: place.name, category: place.category, place: placeRefFrom(place) });
    if (alsoSave) void api('/api/library/places', { method: 'POST', json: { id: crypto.randomUUID(), name: place.name, category: place.category, address: place.address, city: place.city, country: place.country, lat: place.lat, lng: place.lng, providerId: place.providerId } }).catch(() => undefined);
  };

  return (
    <div className="stack">
      <p className="small muted">Adding to <strong>{where}</strong>{near ? '. Results near this destination come first.' : '.'}</p>
      <div className="segmented" role="tablist" aria-label="Source">
        <button type="button" role="tab" aria-selected={tab === 'search'} onClick={() => setTab('search')}>Search</button>
        <button type="button" role="tab" aria-selected={tab === 'saved'} onClick={() => setTab('saved')}><Bookmark size={14} aria-hidden /> Saved Places</button>
      </div>
      {tab === 'search' ? (
        <>
          <PlaceSearch near={near} autoFocus inline label="Search for a place" placeholder={destination ? `Attractions, restaurants, streets in ${destination.name}…` : 'Attractions, restaurants, addresses…'} onSelect={fromSearch}
            extraOptions={[{ id: 'custom', label: 'Add without a location', detail: 'Use what you typed as the title — add a location later', icon: <PenLine size={16} />, onSelect: (query) => query && add({ title: query, category: 'other', place: null }) }]} />
          <label className="checkbox"><input type="checkbox" checked={alsoSave} onChange={(event) => setAlsoSave(event.target.checked)} /> Also keep it in my Saved Places</label>
        </>
      ) : (
        <div className="saved-picker">
          {saved === null ? <p className="small muted">Loading…</p> : saved.length === 0 ? <p className="small muted">No Saved Places yet. Save places from search, or from the Saved Places page.</p> : (
            <ul className="saved-picker-list">
              {saved.map((place) => (
                <li key={place.id}>
                  <button type="button" className="place-option" onClick={() => add({ title: place.name, category: place.category, place: { name: place.name, address: place.address, lat: place.lat, lng: place.lng, providerId: place.providerId }, notes: place.notes, url: place.url })}>
                    <span className="place-option-icon"><Bookmark size={16} /></span>
                    <span className="place-option-text"><strong>{place.name}</strong><span>{[place.city, place.country].filter(Boolean).join(', ') || 'Saved place'}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function NoteForm({ target, onDone }: { target: NonNullable<AddTarget>; onDone: () => void }) {
  const { run, view: aggregate } = useTrip();
  const { day, destination, where } = useTargetContext(target);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const submit = () => {
    if (!title.trim()) return;
    if (run({ type: 'activity.add', index: target.index, activity: makeActivity({ id: crypto.randomUUID(), kind: 'note', category: 'other', title: title.trim(), notes: notes.trim(), dayId: day?.id ?? null, destinationId: day ? null : destination?.id ?? null, currency: aggregate.trip.currency }) }, { label: 'Add note' })) onDone();
  };
  return (
    <form className="stack" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <p className="small muted">Adding to <strong>{where}</strong>.</p>
      <Field label="Note"><input className="input" value={title} autoFocus maxLength={200} placeholder="e.g. Pack a rain jacket" onChange={(event) => setTitle(event.target.value)} /></Field>
      <Field label="Details" optional><textarea className="textarea" value={notes} maxLength={5000} onChange={(event) => setNotes(event.target.value)} /></Field>
      <div className="row"><span className="spacer" /><Button type="submit" variant="primary" disabled={!title.trim()}>Add note</Button></div>
    </form>
  );
}

const MODES: TransportMode[] = ['flight', 'train', 'bus', 'ferry', 'car', 'taxi', 'transfer', 'walk', 'bike', 'other'];

function TransportForm({ target, onDone }: { target: NonNullable<AddTarget>; onDone: () => void }) {
  const { run, view: aggregate } = useTrip();
  const ui = usePlannerUI();
  const { day, destination, where } = useTargetContext(target);
  const link = connections(aggregate).find((item) => item.to.id === destination?.id && item.firstDay?.id === day?.id) ?? null;
  const [mode, setMode] = useState<TransportMode>('train');
  const [from, setFrom] = useState(link?.from.name ?? '');
  const [to, setTo] = useState(link?.to.name ?? destination?.name ?? '');
  const [departTime, setDepartTime] = useState('');
  const [arriveTime, setArriveTime] = useState('');
  const [offset, setOffset] = useState(0);
  const [operator, setOperator] = useState('');
  const [serviceNumber, setServiceNumber] = useState('');
  const [status, setStatus] = useState<BookingStatus>('planned');
  const [cost, setCost] = useState('');

  const submit = () => {
    if (!from.trim() || !to.trim()) return;
    const fromDestination = aggregate.destinations.find((item) => item.name === from.trim());
    const toDestination = aggregate.destinations.find((item) => item.name === to.trim());
    const id = crypto.randomUUID();
    const ok = run({
      type: 'activity.add',
      index: 0,
      activity: makeActivity({
        id, kind: 'transport', category: 'other', title: `${TRANSPORT[mode].label} ${from.trim()} → ${to.trim()}`, dayId: day?.id ?? null, destinationId: day ? null : destination?.id ?? null,
        bookingStatus: status, cost: cost ? Number(cost) : null, currency: aggregate.trip.currency,
        transport: makeTransport({
          mode, from: { name: from.trim(), lat: fromDestination?.lat ?? null, lng: fromDestination?.lng ?? null }, to: { name: to.trim(), lat: toDestination?.lat ?? null, lng: toDestination?.lng ?? null },
          departTime: departTime || null, arriveTime: arriveTime || null, arriveDayOffset: offset,
          departTimezone: fromDestination?.timezone ?? destination?.timezone ?? null, arriveTimezone: toDestination?.timezone ?? destination?.timezone ?? null,
          operator: operator.trim() || null, serviceNumber: serviceNumber.trim() || null,
        }),
      }),
    }, { label: `Add ${TRANSPORT[mode].label.toLowerCase()}` });
    if (ok) { onDone(); ui.openEditor({ type: 'activity', id }); }
  };

  return (
    <form className="stack" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <p className="small muted">Adding to <strong>{where}</strong>. Times are local to each end; you can add time zones in the editor.</p>
      <div className="chip-row" role="group" aria-label="Mode">
        {MODES.map((item) => { const Icon = TRANSPORT[item].icon; return <button key={item} type="button" className="chip" aria-pressed={mode === item} onClick={() => setMode(item)}><Icon size={14} aria-hidden /> {TRANSPORT[item].label}</button>; })}
      </div>
      <div className="field-row">
        <Field label="From"><input className="input" value={from} onChange={(event) => setFrom(event.target.value)} list="destination-names" autoFocus={!from} /></Field>
        <Field label="To"><input className="input" value={to} onChange={(event) => setTo(event.target.value)} list="destination-names" /></Field>
      </div>
      <datalist id="destination-names">{aggregate.destinations.map((item) => <option key={item.id} value={item.name} />)}</datalist>
      <div className="field-row">
        <Field label="Departs" optional><input className="input" type="time" value={departTime} onChange={(event) => setDepartTime(event.target.value)} /></Field>
        <Field label="Arrives" optional><input className="input" type="time" value={arriveTime} onChange={(event) => setArriveTime(event.target.value)} /></Field>
        <Field label="Arrival day"><select className="select" value={offset} onChange={(event) => setOffset(Number(event.target.value))}><option value={0}>Same day</option><option value={1}>Next day</option><option value={2}>+2 days</option></select></Field>
      </div>
      <div className="field-row">
        <Field label="Operator" optional><input className="input" value={operator} placeholder="Airline, rail company…" onChange={(event) => setOperator(event.target.value)} /></Field>
        <Field label="Flight / train no." optional><input className="input" value={serviceNumber} onChange={(event) => setServiceNumber(event.target.value)} /></Field>
      </div>
      <div className="field-row">
        <Field label="Booking"><select className="select" value={status} onChange={(event) => setStatus(event.target.value as BookingStatus)}>{(Object.keys(BOOKING) as BookingStatus[]).filter((item) => item !== 'none').map((item) => <option key={item} value={item}>{BOOKING[item].label}</option>)}</select></Field>
        <Field label={`Cost (${aggregate.trip.currency})`} optional><input className="input" type="number" min={0} inputMode="decimal" value={cost} onChange={(event) => setCost(event.target.value)} /></Field>
      </div>
      <div className="row"><span className="spacer" /><Button type="submit" variant="primary" disabled={!from.trim() || !to.trim()}>Add transport</Button></div>
    </form>
  );
}

function StayForm({ target, onDone }: { target: NonNullable<AddTarget>; onDone: () => void }) {
  const { run, view: aggregate } = useTrip();
  const ui = usePlannerUI();
  const { day, destination, near, where } = useTargetContext(target);
  const remaining = destination?.endDay && day ? Math.max(1, destination.endDay - day.number + 1) : 1;
  const [nights, setNights] = useState(remaining);
  const [status, setStatus] = useState<BookingStatus>('planned');
  const [name, setName] = useState('');

  const create = (place: { name: string; address?: string | null; lat?: number | null; lng?: number | null; providerId?: string | null } | null, label: string) => {
    const id = crypto.randomUUID();
    const ok = run({ type: 'stay.add', stay: makeStay({ id, name: label, place, startDayId: day?.id ?? null, destinationId: destination?.id ?? null, nights, bookingStatus: status, currency: aggregate.trip.currency }) }, { label: `Add stay ${label}` });
    if (ok) { onDone(); ui.openEditor({ type: 'stay', id }); }
  };

  return (
    <div className="stack">
      <p className="small muted">Checking in on <strong>{where}</strong>. One stay covers all its nights.</p>
      <div className="field-row">
        <Field label="Nights"><input className="input" type="number" min={1} max={60} value={nights} onChange={(event) => setNights(Math.max(1, Number(event.target.value) || 1))} /></Field>
        <Field label="Booking"><select className="select" value={status} onChange={(event) => setStatus(event.target.value as BookingStatus)}>{(['idea', 'planned', 'booked'] as BookingStatus[]).map((item) => <option key={item} value={item}>{BOOKING[item].label}</option>)}</select></Field>
      </div>
      <Field label="Find the property" hint="Search by hotel name, or type a name and add it without a location.">
        <div><PlaceSearch near={near} inline label="Search for accommodation" placeholder="Hotel, hostel or address" onSelect={(place) => create(placeRefFrom(place), place.name)}
          extraOptions={[{ id: 'typed', label: 'Use this name without a location', icon: <PenLine size={16} />, onSelect: (query) => (query || name) && create(null, query || name) }]} /></div>
      </Field>
      <form className="row" onSubmit={(event) => { event.preventDefault(); if (name.trim()) create(null, name.trim()); }}>
        <input className="input" aria-label="Property name" placeholder="Or just type a name, e.g. “Hotel near the Bund”" value={name} onChange={(event) => setName(event.target.value)} />
        <Button type="submit" disabled={!name.trim()}>Add</Button>
      </form>
    </div>
  );
}
