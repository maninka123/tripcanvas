'use client';

import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { ItineraryEvent, SectionTrip } from '@/lib/types';
import type { EventInput } from '@/lib/validation';
import { ItineraryView } from './ItineraryView';
import { AddDialog } from './PlannerApp';

export function SectionTripEditor({ section, onUpdateSection, onClose }: { section: SectionTrip; onUpdateSection: (id: string, updater: (current: SectionTrip) => SectionTrip) => void; onClose: () => void }) {
  const [modal, setModal] = useState<'event' | null>(null);
  const [eventDraft, setEventDraft] = useState<{ event?: ItineraryEvent; dayId?: string } | null>(null);

  const openAddEvent = (dayId?: string) => { setEventDraft(dayId ? { dayId } : null); setModal('event'); };
  const openEditEvent = (event: ItineraryEvent) => { setEventDraft({ event }); setModal('event'); };
  const closeModal = () => { setModal(null); setEventDraft(null); };

  const onCreateEvent = (input: EventInput) => {
    const event: ItineraryEvent = { id: crypto.randomUUID(), dayId: input.dayId, title: input.title, category: input.category, time: input.time, timePrecision: input.time ? 'exact' : 'unscheduled', location: input.location, origin: input.origin, destination: input.destination, transportMode: input.transportMode, provider: input.provider, description: input.description, estimatedCost: input.estimatedCost, currency: 'AUD', bookingStatus: input.bookingStatus, paymentStatus: 'Not Paid', links: input.url ? [{ title: 'Open link', url: input.url, type: 'Reference', description: 'Added with this event' }] : [], sortOrder: 99 };
    onUpdateSection(section.id, (current) => ({ ...current, days: current.days.map((day) => day.id === input.dayId ? { ...day, events: [...day.events, event].map((item, index) => ({ ...item, sortOrder: index })) } : day) }));
    closeModal();
  };

  const onUpdateEvent = (eventId: string, input: EventInput) => {
    onUpdateSection(section.id, (current) => ({
      ...current,
      days: current.days.map((day) => {
        const has = day.events.some((event) => event.id === eventId);
        if (day.id === input.dayId) {
          const existing = day.events.find((event) => event.id === eventId);
          const updated: ItineraryEvent = { ...(existing ?? { id: eventId, currency: 'AUD', paymentStatus: 'Not Paid', sortOrder: day.events.length } as ItineraryEvent), dayId: input.dayId, title: input.title, category: input.category, time: input.time, timePrecision: input.time ? 'exact' : 'unscheduled', location: input.location, origin: input.origin, destination: input.destination, transportMode: input.transportMode, provider: input.provider, description: input.description, estimatedCost: input.estimatedCost, bookingStatus: input.bookingStatus, links: input.url ? [{ title: 'Open link', url: input.url, type: 'Reference', description: 'Added with this event' }] : existing?.links };
          return { ...day, events: has ? day.events.map((event) => event.id === eventId ? updated : event) : [...day.events, updated] };
        }
        return has ? { ...day, events: day.events.filter((event) => event.id !== eventId) } : day;
      }),
    }));
    closeModal();
  };

  const onDeleteEvent = (dayId: string, eventId: string) => {
    onUpdateSection(section.id, (current) => ({ ...current, days: current.days.map((day) => day.id === dayId ? { ...day, events: day.events.filter((event) => event.id !== eventId) } : day) }));
    closeModal();
  };

  const reorder = (dayId: string, events: ItineraryEvent[]) => onUpdateSection(section.id, (current) => ({ ...current, days: current.days.map((day) => day.id === dayId ? { ...day, events } : day) }));

  return (
    <div className="section-trip-editor">
      <header className="trip-hero cover-new">
        <div className="hero-shade"/>
        <div className="trip-hero-top"><button onClick={onClose}><ArrowLeft size={15}/> Trip library</button></div>
        <div className="trip-hero-copy"><span className="trip-status">Section trip</span><h1><span>{section.name}</span></h1><p>{section.days.length} day{section.days.length === 1 ? '' : 's'} · reusable in any trip</p></div>
      </header>
      <div className="trip-content">
        <ItineraryView days={section.days} saved={[]} onReorder={reorder} onAdd={openAddEvent} onSelectEvent={openEditEvent}/>
      </div>
      {modal === 'event' && <AddDialog type="event" days={section.days} eventDraft={eventDraft} onClose={closeModal} onCreateTrip={() => {}} onCreateEvent={onCreateEvent} onUpdateEvent={onUpdateEvent} onDeleteEvent={onDeleteEvent} onCreateDestination={() => {}}/>}
    </div>
  );
}
