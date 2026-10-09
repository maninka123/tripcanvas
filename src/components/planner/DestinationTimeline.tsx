'use client';

import { ArrowLeft, ArrowRight, Info, Minus, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { PlaceSearch, type PlaceResult } from '@/components/places/PlaceSearch';
import { Button, IconButton } from '@/components/ui/Button';
import { Menu, MenuItem, MenuSeparator, Popover } from '@/components/ui/Menu';
import { ConfirmDialog } from '@/components/ui/Overlay';
import { destinationFrom, fetchDestinationInfo, shortIntro } from '@/features/places/convert';
import { useTrip } from '@/features/trips/client/TripContext';
import { connections, orderedDestinations } from '@/features/trips/selectors';
import type { Destination } from '@/features/trips/types';
import { TRANSPORT } from './meta';
import { usePlannerUI } from './planner-state';

export function DestinationTimeline() {
  const { view: aggregate, run, canEdit } = useTrip();
  const ui = usePlannerUI();
  const destinations = orderedDestinations(aggregate);
  const links = connections(aggregate);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Destination | null>(null);
  const unassigned = aggregate.days.filter((day) => !day.destinationId).length;

  const add = (place: PlaceResult) => {
    setAdding(false);
    const destination = destinationFrom(place);
    const free = aggregate.days.filter((day) => !day.destinationId).length;
    const ok = run({ type: 'destination.add', destination, dayCount: free > 0 ? Math.min(free, 3) : 2 }, { label: `Add ${place.name}` });
    if (!ok) return;
    ui.setDestinationFocus(destination.id);
    void fetchDestinationInfo(place.name, { lat: place.lat, lng: place.lng }).then((info) => {
      if (info) run({ type: 'destination.update', destinationId: destination.id, patch: { imageUrl: info.imageUrl, imageCredit: info.imageUrl ? `${info.credit}: ${info.sourceUrl}` : null, description: shortIntro(info.extract, 3) } }, { label: `Add details for ${place.name}`, undoable: false });
    });
  };

  const setDays = (destination: Destination, dayCount: number) => {
    run({ type: 'destination.setDays', destinationId: destination.id, dayCount }, { label: `${destination.name}: ${dayCount} ${dayCount === 1 ? 'day' : 'days'}` });
  };

  const move = (destination: Destination, toIndex: number) => run({ type: 'destination.move', destinationId: destination.id, toIndex }, { label: `Move ${destination.name}` });

  const focus = (destination: Destination) => {
    ui.setDestinationFocus(destination.id);
    ui.setMapMode('destination');
    if (destination.startDay) ui.setDayNumber(null);
    const element = document.getElementById(`day-${destination.startDay}`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="destinations" aria-labelledby="destinations-title">
      <div className="destinations-head">
        <h2 id="destinations-title" className="eyebrow">Route</h2>
        {unassigned > 0 && destinations.length > 0 ? <span className="badge badge-warning" title="Days not yet given a destination">{unassigned} {unassigned === 1 ? 'day' : 'days'} unassigned</span> : null}
      </div>
      <ol className="destination-track">
        {destinations.map((destination, index) => {
          const days = destination.startDay && destination.endDay ? destination.endDay - destination.startDay + 1 : 0;
          const link = links.find((item) => item.to.id === destination.id);
          const LinkIcon = link?.transport[0]?.transport ? TRANSPORT[link.transport[0].transport.mode].icon : null;
          return (
            <li key={destination.id} className="destination-item">
              {index > 0 ? (
                link?.transport.length ? (
                  <button type="button" className="destination-link has-transport" title={link.transport[0].title} aria-label={`Transport: ${link.transport[0].title}`} onClick={() => ui.openEditor({ type: 'activity', id: link.transport[0].id })}>
                    {LinkIcon ? <LinkIcon size={14} aria-hidden /> : null}
                  </button>
                ) : canEdit && link ? (
                  <button type="button" className="destination-link is-missing" aria-label={`Add transport from ${link.from.name} to ${link.to.name}`} title={`Add transport from ${link.from.name} to ${link.to.name}`}
                    onClick={() => ui.openAdd({ dayId: link.firstDay?.id ?? null, mode: 'transport', destinationId: link.to.id })}>
                    <Plus size={12} aria-hidden />
                  </button>
                ) : <span className="destination-link" aria-hidden />
              ) : null}
              <div className={`destination-chip${ui.destinationFocus === destination.id ? ' is-active' : ''}`} style={{ '--dest': destination.color } as React.CSSProperties}>
                <button type="button" className="destination-chip-main" onClick={() => focus(destination)} aria-label={`${destination.name}, ${days} ${days === 1 ? 'day' : 'days'}${destination.startDay ? `, days ${destination.startDay} to ${destination.endDay}` : ''}`}>
                  <span className="destination-num" aria-hidden>{index + 1}</span>
                  <span className="destination-name">{destination.name}</span>
                  <span className="destination-days">{days}d</span>
                </button>
                {canEdit ? (
                  <span className="destination-stepper">
                    <IconButton size="sm" label={`One fewer day in ${destination.name}`} disabled={days <= 1} onClick={() => setDays(destination, days - 1)}><Minus size={14} /></IconButton>
                    <IconButton size="sm" label={`One more day in ${destination.name}`} onClick={() => setDays(destination, days + 1)}><Plus size={14} /></IconButton>
                    <Menu label={`${destination.name} options`} trigger={<IconButton size="sm" label={`${destination.name} options`}><MoreHorizontal size={14} /></IconButton>}>
                      <MenuItem icon={<Pencil size={16} />} onSelect={() => ui.openEditor({ type: 'destination', id: destination.id })}>Edit destination</MenuItem>
                      <MenuItem icon={<Info size={16} />} onSelect={() => ui.openAdd({ dayId: aggregate.days.find((day) => day.number === destination.startDay)?.id ?? null, destinationId: destination.id, mode: 'place' })}>Add a place in {destination.name}</MenuItem>
                      <MenuSeparator />
                      <MenuItem icon={<ArrowLeft size={16} />} disabled={index === 0} onSelect={() => move(destination, index - 1)}>Move earlier</MenuItem>
                      <MenuItem icon={<ArrowRight size={16} />} disabled={index === destinations.length - 1} onSelect={() => move(destination, index + 1)}>Move later</MenuItem>
                      <MenuSeparator />
                      <MenuItem icon={<Trash2 size={16} />} danger onSelect={() => setRemoving(destination)}>Remove…</MenuItem>
                    </Menu>
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
        {canEdit ? (
          <li className="destination-item">
            <Popover open={adding} onOpenChange={setAdding} className="destination-add-popover"
              trigger={<Button variant={destinations.length ? 'ghost' : 'primary'} size="sm" icon={<Plus size={16} />}>{destinations.length ? 'Destination' : 'Add your first destination'}</Button>}>
              <div className="stack-sm" style={{ width: 'min(360px, calc(100vw - 48px))' }}>
                <strong>Add a destination</strong>
                <PlaceSearch scope="locality" autoFocus inline label="Search for a city or region" placeholder="City, region or island" onSelect={add} />
              </div>
            </Popover>
          </li>
        ) : null}
      </ol>
      <ConfirmDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)} danger confirmLabel="Remove destination"
        title={`Remove ${removing?.name ?? ''}?`}
        description="Its days stay in the trip without a destination, and every plan on them is kept. You can undo this."
        onConfirm={() => { if (removing) run({ type: 'destination.remove', destinationId: removing.id }, { label: `Remove ${removing.name}` }); setRemoving(null); }} />
    </section>
  );
}
