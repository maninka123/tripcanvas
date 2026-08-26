'use client';

import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BedDouble, Bike, Bus, Car, ExternalLink, GripVertical, MapPin, MoreHorizontal, Plane, Ship, Sparkles, TrainFront, Utensils, WalletCards } from 'lucide-react';
import type { ItineraryEvent, SavedPlace, TripDay } from '@/lib/types';
import { dayTotal, reorderEvents } from '@/lib/travel-calculations';

const categoryIcons = { Accommodation: BedDouble, Transport: TrainFront, Attraction: MapPin, Food: Utensils, Activity: Bike, Note: Sparkles };
const transportIcons: Record<string, typeof Car> = { flight: Plane, high_speed_train: TrainFront, train: TrainFront, bus: Bus, ferry: Ship, rental_car: Car, bicycle: Bike };

function EventCard({ event, onSelect }: { event: ItineraryEvent; onSelect: (event: ItineraryEvent) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: event.id });
  const Icon = event.category === 'Transport' && event.transportMode ? (transportIcons[event.transportMode] ?? TrainFront) : categoryIcons[event.category];
  return (
    <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`event-card category-${event.category.toLowerCase()} ${isDragging ? 'is-dragging' : ''}`} onClick={() => onSelect(event)}>
      <button className="drag-handle" type="button" aria-label={`Reorder ${event.title}`} {...attributes} {...listeners}><GripVertical size={15}/></button>
      <div className="event-icon"><Icon size={18}/></div>
      <div className="event-copy"><div className="event-label"><span>{event.subcategory ?? event.category}</span><span className={`booking-dot status-${event.bookingStatus.toLowerCase().replaceAll(' ','-')}`}>{event.bookingStatus}</span></div><h4>{event.title}</h4>{event.description && <p>{event.description}</p>}<div className="event-meta">{event.provider && <span>{event.provider}{event.serviceNumber ? ` · ${event.serviceNumber}` : ''}</span>}{event.duration && <span>{event.duration}</span>}{event.location && <span><MapPin size={12}/>{event.location}</span>}</div>{event.details && <div className="detail-chips">{event.details.map((detail) => <span key={detail}>✓ {detail}</span>)}</div>}{event.links?.[0] && <a href={event.links[0].url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><ExternalLink size={12}/>{event.links[0].title}</a>}</div>
      <div className="event-cost"><strong>{event.estimatedCost ? `A$${event.estimatedCost}` : 'Free'}</strong><small>estimated</small><button type="button" aria-label={`More options for ${event.title}`}><MoreHorizontal size={17}/></button></div>
    </article>
  );
}

function DayTimeline({ day, onReorder, onSelectEvent }: { day: TripDay; onReorder: (dayId: string, events: ItineraryEvent[]) => void; onSelectEvent: (event: ItineraryEvent) => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 7 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const handleDragEnd = ({ active, over }: DragEndEvent) => { if (over) onReorder(day.id, reorderEvents(day.events, String(active.id), String(over.id))); };
  return (
    <section className="day-block" id={`day-${day.number}`}>
      <header className="day-heading"><div className="day-number"><span>DAY</span><strong>{day.number}</strong></div><div><p>{day.date}</p><h3>{day.title}</h3></div><div className="day-total"><small>Day total</small><strong>A${dayTotal(day).toLocaleString()}</strong></div></header>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}><SortableContext items={day.events.map((event) => event.id)} strategy={verticalListSortingStrategy}><div className="events-list">{day.events.map((event) => <div className="timeline-row" key={event.id}><time>{event.time ?? '—'}</time><span className="timeline-dot"/><EventCard event={event} onSelect={onSelectEvent}/></div>)}</div></SortableContext></DndContext>
      <button className="add-to-day" type="button">＋ Add to Day {day.number}</button>
    </section>
  );
}

export function ItineraryView({ days, saved, onReorder, onAdd, onSelectEvent }: { days: TripDay[]; saved: SavedPlace[]; onReorder: (dayId: string, events: ItineraryEvent[]) => void; onAdd: () => void; onSelectEvent: (event: ItineraryEvent) => void }) {
  return <div className="itinerary-layout"><div><div className="view-title"><div><p className="eyebrow">YOUR ITINERARY</p><h2>15 days, beautifully connected</h2></div><button className="primary-button" type="button" onClick={onAdd}>＋ Add event</button></div>{days.map((day) => <DayTimeline key={day.id} day={day} onReorder={onReorder} onSelectEvent={onSelectEvent}/>)}</div><aside className="ideas-panel"><div className="ideas-header"><div><p className="eyebrow">SAVED IDEAS</p><h3>Maybe later</h3></div><span>{saved.length}</span></div><p className="ideas-help">Drag an idea into a day when it finds its place.</p>{saved.map((place) => <article key={place.id}><div className="saved-icon"><MapPin size={15}/></div><div><strong>{place.title}</strong><small>{place.city} · {place.category}</small><p>{place.note}</p></div><GripVertical size={14}/></article>)}<button type="button" className="save-place">＋ Save another place</button><div className="wallet-note"><WalletCards size={18}/><div><strong>Tickets travel with you</strong><p>Your confirmed bookings are available in the Travel Wallet.</p></div></div></aside></div>;
}
