'use client';

import { BedDouble, ExternalLink, Inbox, MapPin, Navigation, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { PlaceSearch } from '@/components/places/PlaceSearch';
import { Button, IconButton } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Drawer } from '@/components/ui/Overlay';
import { useToast } from '@/components/ui/Toast';
import { formatMoney } from '@/features/budget/budget';
import { placeRefFrom } from '@/features/places/convert';
import { useTrip } from '@/features/trips/client/TripContext';
import type { OperationInput } from '@/features/trips/operations';
import { attachmentsFor } from '@/features/trips/selectors';
import type { Activity, ActivityCategory, BookingStatus, Destination, PlaceRef, Stay, StayType, TimeSlot, TransportMode } from '@/features/trips/types';
import { formatDuration, journeyMinutes } from '@/lib/dates';
import { directionsLink, hostnameOf, mapsLink, safeHref } from '@/lib/urls';
import { BOOKING, CATEGORY, COMMON_CURRENCIES, SLOTS, STAY_TYPES, TRANSPORT } from '../meta';
import { usePlannerUI } from '../planner-state';
import { Attachments, AutoInput, AutoNumber, AutoTextarea } from './fields';

export function EditorDrawer() {
  const ui = usePlannerUI();
  const { view: aggregate } = useTrip();
  const editor = ui.editor;
  const activity = editor?.type === 'activity' ? aggregate.activities.find((item) => item.id === editor.id) : undefined;
  const stay = editor?.type === 'stay' ? aggregate.stays.find((item) => item.id === editor.id) : undefined;
  const destination = editor?.type === 'destination' ? aggregate.destinations.find((item) => item.id === editor.id) : undefined;
  const close = () => ui.openEditor(null);
  if (!activity && !stay && !destination) return null;
  const title = activity ? (activity.kind === 'transport' ? 'Transport' : activity.kind === 'note' ? 'Note' : 'Plan') : stay ? 'Stay' : 'Destination';
  return (
    <Drawer open onOpenChange={(open) => !open && close()} title={title} modal={false}>
      {activity ? <ActivityEditor key={activity.id} activity={activity} onClose={close} /> : null}
      {stay ? <StayEditor key={stay.id} stay={stay} onClose={close} /> : null}
      {destination ? <DestinationEditor key={destination.id} destination={destination} /> : null}
    </Drawer>
  );
}

function BookingFields({ status, reference, cost, currency, onChange, idPrefix }: { status: BookingStatus; reference: string | null; cost: number | null; currency: string; onChange: (patch: { bookingStatus?: BookingStatus; bookingReference?: string | null; cost?: number | null; currency?: string }, key: string) => void; idPrefix: string }) {
  const { canEdit } = useTrip();
  return (
    <fieldset className="editor-group" disabled={!canEdit}>
      <legend>Booking &amp; cost</legend>
      <div className="field-row">
        <Field label="Status">
          <select className="select" value={status} onChange={(event) => onChange({ bookingStatus: event.target.value as BookingStatus }, `${idPrefix}:status`)}>
            {(Object.keys(BOOKING) as BookingStatus[]).map((item) => <option key={item} value={item}>{BOOKING[item].label}</option>)}
          </select>
        </Field>
        <Field label="Reference" optional><AutoInput value={reference ?? ''} placeholder="Confirmation code" onCommit={(value) => onChange({ bookingReference: value.trim() || null }, `${idPrefix}:ref`)} /></Field>
      </div>
      <Field label="Cost" optional hint={status === 'booked' ? 'Counts as confirmed spend.' : 'Counts as an estimate until booked.'}>
        <div className="input-affix">
          <AutoNumber value={cost} placeholder="0" onCommit={(value) => onChange({ cost: value }, `${idPrefix}:cost`)} />
          <select className="select" aria-label="Currency" value={currency} onChange={(event) => onChange({ currency: event.target.value }, `${idPrefix}:currency`)}>
            {[...new Set([currency, ...COMMON_CURRENCIES])].map((code) => <option key={code}>{code}</option>)}
          </select>
        </div>
      </Field>
    </fieldset>
  );
}

function LocationField({ place, near, onChange, label = 'Location' }: { place: PlaceRef | null; near: { lat: number; lng: number } | null; onChange: (place: PlaceRef | null) => void; label?: string }) {
  const { canEdit } = useTrip();
  const [changing, setChanging] = useState(!place);
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {place && !changing ? (
        <div className="location-card">
          <MapPin size={16} aria-hidden />
          <div className="spacer" style={{ minWidth: 0 }}>
            <strong className="truncate" style={{ display: 'block' }}>{place.name}</strong>
            <span className="tiny subtle">{place.address ?? (typeof place.lat === 'number' ? `${place.lat.toFixed(4)}, ${place.lng?.toFixed(4)}` : 'Not on the map yet')}</span>
          </div>
          <a className="btn btn-sm btn-ghost" href={mapsLink(place)} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} aria-hidden /> Maps</a>
          {canEdit ? <Button size="sm" variant="ghost" onClick={() => setChanging(true)}>Change</Button> : null}
          {canEdit ? <IconButton size="sm" label="Remove location" onClick={() => onChange(null)}><X size={14} /></IconButton> : null}
        </div>
      ) : canEdit ? (
        <PlaceSearch near={near} label={`Search for ${label.toLowerCase()}`} onSelect={(result) => { onChange(placeRefFrom(result)); setChanging(false); }} />
      ) : <p className="small subtle">No location.</p>}
    </div>
  );
}

const DURATIONS = [30, 60, 90, 120, 180, 240, 360];

function ActivityEditor({ activity, onClose }: { activity: Activity; onClose: () => void }) {
  const { view: aggregate, run, canEdit, sync } = useTrip();
  const toast = useToast();
  const day = aggregate.days.find((item) => item.id === activity.dayId) ?? null;
  const destination = aggregate.destinations.find((item) => item.id === (day?.destinationId ?? activity.destinationId)) ?? null;
  const near = destination && typeof destination.lat === 'number' && typeof destination.lng === 'number' ? { lat: destination.lat, lng: destination.lng } : null;
  const update = (patch: Extract<OperationInput, { type: 'activity.update' }>['patch'], key: string) => run({ type: 'activity.update', activityId: activity.id, patch }, { label: `Edit ${activity.title}`, coalesceKey: `${activity.id}:${key}` });
  const transport = activity.transport;
  const setTransport = (patch: Partial<NonNullable<Activity['transport']>>, key: string) => transport && update({ transport: { ...transport, ...patch } }, `transport:${key}`);
  const zones = [...new Set(aggregate.destinations.map((item) => item.timezone).filter((zone): zone is string => !!zone))];
  const minutes = transport ? journeyMinutes({ departDate: day?.date ?? null, ...transport }) : null;
  const attachments = attachmentsFor(aggregate, { activityId: activity.id });

  const remove = () => {
    if (!run({ type: 'activity.remove', activityId: activity.id }, { label: `Delete ${activity.title}` })) return;
    onClose();
    toast({ message: `Deleted “${activity.title}”.`, action: { label: 'Undo', onClick: () => sync.undo() } });
  };

  return (
    <div className="editor stack">
      <Field label="Title"><AutoInput value={activity.title} maxLength={200} disabled={!canEdit} onCommit={(value) => value.trim() && update({ title: value.trim() }, 'title')} /></Field>

      {activity.kind === 'place' ? (
        <>
          <LocationField place={activity.place} near={near} onChange={(place) => update({ place }, 'place')} />
          {activity.place && typeof activity.place.lat === 'number' ? <a className="small" href={directionsLink(activity.place)} target="_blank" rel="noopener noreferrer"><Navigation size={13} aria-hidden /> Directions</a> : null}
          <Field label="Type">
            <select className="select" value={activity.category} disabled={!canEdit} onChange={(event) => update({ category: event.target.value as ActivityCategory }, 'category')}>
              {(Object.keys(CATEGORY) as ActivityCategory[]).map((item) => <option key={item} value={item}>{CATEGORY[item].label}</option>)}
            </select>
          </Field>
        </>
      ) : null}

      {transport ? (
        <fieldset className="editor-group" disabled={!canEdit}>
          <legend>Journey</legend>
          <Field label="Mode">
            <select className="select" value={transport.mode} onChange={(event) => setTransport({ mode: event.target.value as TransportMode }, 'mode')}>
              {(Object.keys(TRANSPORT) as TransportMode[]).map((mode) => <option key={mode} value={mode}>{TRANSPORT[mode].label}</option>)}
            </select>
          </Field>
          <div className="field-row">
            <Field label="From"><AutoInput value={transport.from.name} onCommit={(value) => value.trim() && setTransport({ from: { ...transport.from, name: value.trim() } }, 'from')} /></Field>
            <Field label="To"><AutoInput value={transport.to.name} onCommit={(value) => value.trim() && setTransport({ to: { ...transport.to, name: value.trim() } }, 'to')} /></Field>
          </div>
          <div className="field-row">
            <Field label="Departs" optional><input className="input" type="time" value={transport.departTime ?? ''} onChange={(event) => setTransport({ departTime: event.target.value || null }, 'depart')} /></Field>
            <Field label="Arrives" optional><input className="input" type="time" value={transport.arriveTime ?? ''} onChange={(event) => setTransport({ arriveTime: event.target.value || null }, 'arrive')} /></Field>
            <Field label="Arrival day"><select className="select" value={transport.arriveDayOffset} onChange={(event) => setTransport({ arriveDayOffset: Number(event.target.value) }, 'offset')}><option value={0}>Same day</option><option value={1}>Next day</option><option value={2}>+2 days</option><option value={3}>+3 days</option></select></Field>
          </div>
          <div className="field-row">
            <Field label="Departure time zone" optional hint="IANA name, e.g. Asia/Shanghai"><AutoInput value={transport.departTimezone ?? ''} list="tz-list" onCommit={(value) => setTransport({ departTimezone: value.trim() || null }, 'dtz')} /></Field>
            <Field label="Arrival time zone" optional><AutoInput value={transport.arriveTimezone ?? ''} list="tz-list" onCommit={(value) => setTransport({ arriveTimezone: value.trim() || null }, 'atz')} /></Field>
          </div>
          <datalist id="tz-list">{zones.map((zone) => <option key={zone} value={zone} />)}</datalist>
          {minutes !== null ? <p className="small muted">Journey time: <strong>{formatDuration(minutes)}</strong>{transport.departTimezone !== transport.arriveTimezone ? ' (accounting for time zones)' : ''}.</p> : null}
          <div className="field-row">
            <Field label="Operator" optional><AutoInput value={transport.operator ?? ''} onCommit={(value) => setTransport({ operator: value.trim() || null }, 'operator')} /></Field>
            <Field label="Service number" optional><AutoInput value={transport.serviceNumber ?? ''} onCommit={(value) => setTransport({ serviceNumber: value.trim() || null }, 'service')} /></Field>
          </div>
        </fieldset>
      ) : null}

      {activity.kind !== 'transport' ? (
        <fieldset className="editor-group" disabled={!canEdit}>
          <legend>When</legend>
          <Field label="Day">
            <select className="select" value={activity.dayId ?? ''} onChange={(event) => run({ type: 'activity.move', activityId: activity.id, dayId: event.target.value || null, index: 999 }, { label: `Move ${activity.title}` })}>
              <option value="">Ideas (not scheduled)</option>
              {aggregate.days.map((item) => <option key={item.id} value={item.id}>Day {item.number}{item.date ? ` · ${item.date}` : ''}{item.destinationId ? ` · ${aggregate.destinations.find((dest) => dest.id === item.destinationId)?.name ?? ''}` : ''}</option>)}
            </select>
          </Field>
          <div className="segmented" role="group" aria-label="Time of day">
            {(Object.keys(SLOTS) as TimeSlot[]).map((slot) => <button key={slot} type="button" aria-pressed={activity.timeSlot === slot && !activity.startTime} onClick={() => update({ timeSlot: slot, startTime: null }, 'slot')}>{SLOTS[slot]}</button>)}
          </div>
          <div className="field-row">
            <Field label="Start time" optional><input className="input" type="time" value={activity.startTime ?? ''} onChange={(event) => update({ startTime: event.target.value || null }, 'start')} /></Field>
            <Field label="Duration" optional>
              <select className="select" value={activity.durationMinutes ?? ''} onChange={(event) => update({ durationMinutes: event.target.value ? Number(event.target.value) : null }, 'duration')}>
                <option value="">Not set</option>
                {[...new Set([...DURATIONS, ...(activity.durationMinutes ? [activity.durationMinutes] : [])])].sort((a, b) => a - b).map((value) => <option key={value} value={value}>{formatDuration(value)}</option>)}
              </select>
            </Field>
          </div>
        </fieldset>
      ) : (
        <Field label="Day">
          <select className="select" value={activity.dayId ?? ''} disabled={!canEdit} onChange={(event) => run({ type: 'activity.move', activityId: activity.id, dayId: event.target.value || null, index: 0 }, { label: `Move ${activity.title}` })}>
            <option value="">Not scheduled</option>
            {aggregate.days.map((item) => <option key={item.id} value={item.id}>Day {item.number}{item.date ? ` · ${item.date}` : ''}</option>)}
          </select>
        </Field>
      )}

      {activity.kind !== 'note' ? (
        <BookingFields idPrefix={activity.id} status={activity.bookingStatus} reference={activity.bookingReference} cost={activity.cost} currency={activity.currency}
          onChange={(patch, key) => update(patch, key)} />
      ) : null}

      <Field label="Notes" optional><AutoTextarea value={activity.notes} maxLength={5000} disabled={!canEdit} rows={4} placeholder="Tips, reminders, what to book…" onCommit={(value) => update({ notes: value }, 'notes')} /></Field>
      <Field label="Link" optional hint={activity.url ? hostnameOf(activity.url) ?? undefined : 'Official website, booking page or article'}>
        <AutoInput value={activity.url ?? ''} type="url" inputMode="url" placeholder="https://…" disabled={!canEdit}
          onCommit={(value) => { const next = value.trim(); if (!next || safeHref(next)) update({ url: next || null }, 'url'); else toast({ message: 'Links must start with http:// or https://', tone: 'error' }); }} />
      </Field>

      {activity.kind !== 'note' ? (
        <section className="editor-group">
          <h3 className="editor-heading">Tickets &amp; documents</h3>
          <Attachments attachments={attachments} owner={{ activityId: activity.id }} canEdit={canEdit} />
        </section>
      ) : null}

      {canEdit ? (
        <div className="editor-actions">
          {activity.dayId ? <Button variant="ghost" icon={<Inbox size={16} />} onClick={() => run({ type: 'activity.move', activityId: activity.id, dayId: null, index: 999 }, { label: `Move ${activity.title} to Ideas` })}>Move to Ideas</Button> : null}
          <span className="spacer" />
          <Button variant="danger-ghost" icon={<Trash2 size={16} />} onClick={remove}>Delete</Button>
        </div>
      ) : null}
    </div>
  );
}

function StayEditor({ stay, onClose }: { stay: Stay; onClose: () => void }) {
  const { view: aggregate, run, canEdit, sync } = useTrip();
  const toast = useToast();
  const update = (patch: Extract<OperationInput, { type: 'stay.update' }>['patch'], key: string) => run({ type: 'stay.update', stayId: stay.id, patch }, { label: `Edit ${stay.name}`, coalesceKey: `${stay.id}:${key}` });
  const start = aggregate.days.find((day) => day.id === stay.startDayId);
  const destination = aggregate.destinations.find((item) => item.id === stay.destinationId);
  const near = destination && typeof destination.lat === 'number' && typeof destination.lng === 'number' ? { lat: destination.lat, lng: destination.lng } : null;
  const remove = () => {
    if (!run({ type: 'stay.remove', stayId: stay.id }, { label: `Delete ${stay.name}` })) return;
    onClose();
    toast({ message: `Removed “${stay.name}”.`, action: { label: 'Undo', onClick: () => sync.undo() } });
  };
  const perNight = stay.cost && stay.nights ? stay.cost / stay.nights : null;
  return (
    <div className="editor stack">
      <Field label="Property name"><AutoInput value={stay.name} disabled={!canEdit} onCommit={(value) => value.trim() && update({ name: value.trim() }, 'name')} /></Field>
      <div className="field-row">
        <Field label="Type"><select className="select" value={stay.type} disabled={!canEdit} onChange={(event) => update({ type: event.target.value as StayType }, 'type')}>{(Object.keys(STAY_TYPES) as StayType[]).map((type) => <option key={type} value={type}>{STAY_TYPES[type]}</option>)}</select></Field>
        <Field label="Nights"><AutoNumber value={stay.nights} min={1} disabled={!canEdit} onCommit={(value) => value && update({ nights: Math.max(1, Math.round(value)) }, 'nights')} /></Field>
      </div>
      <Field label="Check-in day">
        <select className="select" value={stay.startDayId ?? ''} disabled={!canEdit} onChange={(event) => { const dayId = event.target.value || null; update({ startDayId: dayId, destinationId: aggregate.days.find((day) => day.id === dayId)?.destinationId ?? stay.destinationId }, 'start'); }}>
          <option value="">Not scheduled</option>
          {aggregate.days.map((day) => <option key={day.id} value={day.id}>Day {day.number}{day.date ? ` · ${day.date}` : ''}</option>)}
        </select>
      </Field>
      {start ? <p className="small muted">Covers nights of days {start.number}–{start.number + stay.nights - 1}; check out on day {start.number + stay.nights}.</p> : null}
      <div className="field-row">
        <Field label="Check-in time" optional><input className="input" type="time" value={stay.checkInTime ?? ''} disabled={!canEdit} onChange={(event) => update({ checkInTime: event.target.value || null }, 'in')} /></Field>
        <Field label="Check-out time" optional><input className="input" type="time" value={stay.checkOutTime ?? ''} disabled={!canEdit} onChange={(event) => update({ checkOutTime: event.target.value || null }, 'out')} /></Field>
      </div>
      <LocationField place={stay.place} near={near} label="Address" onChange={(place) => update({ place }, 'place')} />
      <BookingFields idPrefix={stay.id} status={stay.bookingStatus} reference={stay.bookingReference} cost={stay.cost} currency={stay.currency} onChange={(patch, key) => update(patch, key)} />
      {perNight ? <p className="small muted">About {formatMoney(perNight, stay.currency)} per night.</p> : null}
      <fieldset className="editor-group" disabled={!canEdit}>
        <legend>Contact</legend>
        <div className="field-row">
          <Field label="Phone" optional><AutoInput value={stay.phone ?? ''} type="tel" onCommit={(value) => update({ phone: value.trim() || null }, 'phone')} /></Field>
          <Field label="Email" optional><AutoInput value={stay.email ?? ''} type="email" onCommit={(value) => { const next = value.trim(); if (!next || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) update({ email: next || null }, 'email'); }} /></Field>
        </div>
        <Field label="Website" optional><AutoInput value={stay.url ?? ''} type="url" placeholder="https://…" onCommit={(value) => { const next = value.trim(); if (!next || safeHref(next)) update({ url: next || null }, 'url'); }} /></Field>
      </fieldset>
      <Field label="Notes" optional><AutoTextarea value={stay.notes} rows={3} disabled={!canEdit} onCommit={(value) => update({ notes: value }, 'notes')} /></Field>
      <section className="editor-group">
        <h3 className="editor-heading">Vouchers &amp; confirmations</h3>
        <Attachments attachments={attachmentsFor(aggregate, { stayId: stay.id })} owner={{ stayId: stay.id }} canEdit={canEdit} />
      </section>
      {canEdit ? <div className="editor-actions"><BedDouble size={16} aria-hidden className="subtle" /><span className="spacer" /><Button variant="danger-ghost" icon={<Trash2 size={16} />} onClick={remove}>Remove stay</Button></div> : null}
    </div>
  );
}

function DestinationEditor({ destination }: { destination: Destination }) {
  const { view: aggregate, run, canEdit } = useTrip();
  const update = (patch: Extract<OperationInput, { type: 'destination.update' }>['patch'], key: string) => run({ type: 'destination.update', destinationId: destination.id, patch }, { label: `Edit ${destination.name}`, coalesceKey: `${destination.id}:${key}` });
  const days = destination.startDay && destination.endDay ? destination.endDay - destination.startDay + 1 : 0;
  const image = safeHref(destination.imageUrl);
  const credit = destination.imageCredit?.match(/https?:\/\/\S+/)?.[0] ?? null;
  return (
    <div className="editor stack">
      {image ? (
        <figure className="destination-figure">
          {/* eslint-disable-next-line @next/next/no-img-element -- Wikimedia/remote destination photo */}
          <img src={image} alt={`${destination.name}`} referrerPolicy="no-referrer" />
          {credit ? <figcaption className="attribution">Photo and introduction: <a href={credit} target="_blank" rel="noopener noreferrer">Wikipedia</a></figcaption> : null}
        </figure>
      ) : null}
      <div className="field-row">
        <Field label="Name"><AutoInput value={destination.name} disabled={!canEdit} onCommit={(value) => value.trim() && update({ name: value.trim() }, 'name')} /></Field>
        <Field label="Country" optional><AutoInput value={destination.country} disabled={!canEdit} onCommit={(value) => update({ country: value.trim() }, 'country')} /></Field>
      </div>
      <Field label="Days here" hint={destination.startDay ? `Days ${destination.startDay}–${destination.endDay}` : 'No days allocated'}>
        <AutoNumber value={days} min={0} disabled={!canEdit} onCommit={(value) => value !== null && run({ type: 'destination.setDays', destinationId: destination.id, dayCount: Math.round(value) }, { label: `${destination.name}: ${value} days` })} />
      </Field>
      <LocationField place={typeof destination.lat === 'number' ? { name: destination.name, lat: destination.lat, lng: destination.lng, address: destination.country } : null} near={null} label="Map location"
        onChange={(place) => update({ lat: place?.lat ?? null, lng: place?.lng ?? null, providerId: place?.providerId ?? null }, 'location')} />
      <Field label="Time zone" optional hint="Used to show transport times correctly."><AutoInput value={destination.timezone ?? ''} placeholder="e.g. Asia/Shanghai" disabled={!canEdit} onCommit={(value) => update({ timezone: value.trim() || null }, 'tz')} /></Field>
      <Field label="About" optional><AutoTextarea value={destination.description ?? ''} rows={4} disabled={!canEdit} onCommit={(value) => update({ description: value.trim() || null }, 'about')} /></Field>
      <p className="tiny subtle">{aggregate.activities.filter((activity) => activity.destinationId === destination.id).length} plans in {destination.name}.</p>
    </div>
  );
}
