'use client';

import { ArrowLeft, BedDouble, ChevronLeft, ChevronRight, Clock, Copy, ExternalLink, FileText, Mail, MapPin, Navigation, Phone, Ticket, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { activityColor, activityIcon, BOOKING, SLOTS } from '@/components/planner/meta';
import { IconButton } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { fileUrl } from '@/features/trips/client/files';
import { activitiesForDay, attachmentsFor, checkOutsByDay, stayNights, travelDay } from '@/features/trips/selectors';
import type { Activity, PlaceRef, TripAggregate } from '@/features/trips/types';
import { api } from '@/lib/api-client';
import { formatDayLabel, formatDuration, journeyMinutes, timeToMinutes, todayIso } from '@/lib/dates';
import { directionsLink, mapsLink } from '@/lib/urls';

// Travel Mode: the trip as you need it on the day. Large touch targets,
// today first, everything one tap from directions, tickets and the hotel.

const offlineKey = (id: string) => `tripcanvas.offline.${id}`;

export function TravelMode({ initial }: { initial: TripAggregate }) {
  const toast = useToast();
  const [aggregate, setAggregate] = useState(initial);
  const [offline, setOffline] = useState<{ savedAt: string } | null>(null);
  // The device clock decides “today”; read it only after mount so server and client render the same markup.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const timer = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(timer); }, []);
  const today = now ? todayIso(now) : '';
  const { day: startDay, isToday } = travelDay(aggregate, today);
  const [dayNumber, setDayNumber] = useState(1);
  const [jumped, setJumped] = useState(false);
  if (now && !jumped) { setJumped(true); if (startDay && isToday) setDayNumber(startDay.number); }
  const day = aggregate.days.find((item) => item.number === dayNumber) ?? aggregate.days[0] ?? null;
  const destination = aggregate.destinations.find((item) => item.id === day?.destinationId) ?? null;
  const viewingToday = !!day && day.date === today;

  // Keep a local copy for poor connections, and register the offline worker.
  useEffect(() => {
    try { localStorage.setItem(offlineKey(initial.trip.id), JSON.stringify({ savedAt: new Date().toISOString(), aggregate: initial })); } catch { /* storage unavailable */ }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(async (registration) => {
        const worker = registration.active ?? (await navigator.serviceWorker.ready).active;
        const urls = [window.location.pathname, `/api/trips/${initial.trip.id}`, ...performance.getEntriesByType('resource').map((entry) => entry.name)];
        worker?.postMessage({ type: 'precache', urls });
      }).catch(() => undefined);
    }
    const goOffline = () => {
      try {
        const saved = JSON.parse(localStorage.getItem(offlineKey(initial.trip.id)) ?? 'null') as { savedAt: string; aggregate: TripAggregate } | null;
        setOffline({ savedAt: saved?.savedAt ?? new Date().toISOString() });
      } catch { setOffline({ savedAt: new Date().toISOString() }); }
    };
    const goOnline = () => {
      setOffline(null);
      api<{ trip: TripAggregate }>(`/api/trips/${initial.trip.id}`).then((data) => { setAggregate(data.trip); try { localStorage.setItem(offlineKey(initial.trip.id), JSON.stringify({ savedAt: new Date().toISOString(), aggregate: data.trip })); } catch { /* ignore */ } }).catch(() => undefined);
    };
    if (!navigator.onLine) goOffline();
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => { window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline); };
  }, [initial]);

  const activities = useMemo(() => (day ? activitiesForDay(aggregate, day.id).filter((activity) => activity.bookingStatus !== 'cancelled') : []), [aggregate, day]);
  const nowMinutes = now ? now.getHours() * 60 + now.getMinutes() : 0;
  const startOf = (activity: Activity) => timeToMinutes(activity.kind === 'transport' ? activity.transport?.departTime : activity.startTime);
  const next = viewingToday
    ? activities.find((activity) => activity.kind !== 'note' && (startOf(activity) ?? 24 * 60) >= nowMinutes - 15) ?? null
    : activities.find((activity) => activity.kind !== 'note') ?? null;
  const tonight = day ? stayNights(aggregate).get(day.id)?.[0] ?? null : null;
  const checkouts = day ? checkOutsByDay(aggregate).get(day.id) ?? [] : [];
  const transport = activities.filter((activity) => activity.kind === 'transport');

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast({ message: `${what} copied.`, tone: 'success' }); }
    catch { toast({ message: 'Copy is not available here.', tone: 'error' }); }
  };

  return (
    <div className="travel">
      <header className="travel-header">
        <Link href={`/trips/${aggregate.trip.id}`} className="travel-back"><ArrowLeft size={18} aria-hidden /> Planner</Link>
        <span className="travel-trip truncate">{aggregate.trip.name}</span>
      </header>
      <main id="main" className="travel-main">
        {offline ? <div className="notice notice-warning" role="status"><WifiOff size={16} aria-hidden /><span>You’re offline — showing the copy saved {new Date(offline.savedAt).toLocaleString()}.</span></div> : null}
        {now && !isToday && day ? (
          <div className="notice notice-neutral"><Clock size={16} aria-hidden /><span>{aggregate.trip.dateMode === 'fixed' && aggregate.trip.startDate && aggregate.trip.startDate > today ? `Your trip starts ${formatDayLabel(aggregate.trip.startDate)}. Previewing the days ahead.` : aggregate.trip.dateMode === 'fixed' ? 'This trip is not running today. Browse any day below.' : 'Flexible dates — browse your days by number.'}</span></div>
        ) : null}

        <nav className="travel-daynav" aria-label="Day">
          <IconButton label="Previous day" disabled={!day || day.number <= 1} onClick={() => setDayNumber((value) => Math.max(1, value - 1))}><ChevronLeft size={22} /></IconButton>
          <div className="travel-day">
            <span className="eyebrow">{viewingToday ? 'Today' : `Day ${day?.number ?? 1} of ${aggregate.days.length}`}</span>
            <h1 className="display">{destination?.name ?? (day ? `Day ${day.number}` : 'Your trip')}</h1>
            <p className="muted">{day?.date ? formatDayLabel(day.date) : `Day ${day?.number ?? 1}`}{day?.title ? ` · ${day.title}` : ''}</p>
          </div>
          <IconButton label="Next day" disabled={!day || day.number >= aggregate.days.length} onClick={() => setDayNumber((value) => Math.min(aggregate.days.length, value + 1))}><ChevronRight size={22} /></IconButton>
        </nav>

        {next ? (
          <section className="travel-next" aria-labelledby="next-title">
            <span className="eyebrow">{viewingToday ? 'Up next' : 'First up'}</span>
            <h2 id="next-title">{next.title}</h2>
            <p className="muted">{[startOf(next) !== null ? (next.kind === 'transport' ? next.transport?.departTime : next.startTime) : SLOTS[next.timeSlot], next.kind === 'transport' && next.transport ? `${next.transport.from.name} → ${next.transport.to.name}` : next.place?.address ?? next.place?.name].filter(Boolean).join(' · ')}</p>
            <PlaceActions place={next.kind === 'transport' ? next.transport?.from ?? null : next.place} onCopy={copy} />
            <TicketLinks aggregate={aggregate} activity={next} />
          </section>
        ) : <section className="travel-next is-empty"><h2>Nothing scheduled</h2><p className="muted">A free day. Check your Ideas in the planner.</p></section>}

        {checkouts.map((stay) => <div key={stay.id} className="travel-row"><BedDouble size={18} aria-hidden /><span>Check out of <strong>{stay.name}</strong>{stay.checkOutTime ? ` by ${stay.checkOutTime}` : ''}</span></div>)}

        {transport.map((activity) => {
          const t = activity.transport!;
          const minutes = journeyMinutes({ departDate: day?.date ?? null, ...t });
          const Icon = activityIcon(activity);
          return (
            <section key={activity.id} className="travel-card" aria-label={activity.title}>
              <div className="travel-card-head"><Icon size={20} aria-hidden style={{ color: activityColor(activity) }} /><h2>{activity.title}</h2>{activity.bookingStatus !== 'none' ? <span className={`badge ${BOOKING[activity.bookingStatus].badge}`}>{BOOKING[activity.bookingStatus].label}</span> : null}</div>
              <div className="travel-journey">
                <div><strong>{t.departTime ?? '—'}</strong><span>{t.from.name}</span></div>
                <span aria-hidden className="travel-journey-line">{minutes ? formatDuration(minutes) : ''}</span>
                <div><strong>{t.arriveTime ?? '—'}{t.arriveDayOffset ? ` +${t.arriveDayOffset}` : ''}</strong><span>{t.to.name}</span></div>
              </div>
              <dl className="travel-facts">
                {t.operator || t.serviceNumber ? <div><dt>Service</dt><dd>{[t.operator, t.serviceNumber].filter(Boolean).join(' ')}</dd></div> : null}
                {activity.bookingReference ? <div><dt>Reference</dt><dd><code>{activity.bookingReference}</code> <button type="button" className="link-button" onClick={() => void copy(activity.bookingReference!, 'Reference')}>Copy</button></dd></div> : null}
              </dl>
              <TicketLinks aggregate={aggregate} activity={activity} />
            </section>
          );
        })}

        <section aria-labelledby="day-plan-title">
          <h2 id="day-plan-title" className="travel-section-title">The day</h2>
          {activities.length ? (
            <ol className="travel-timeline">
              {activities.map((activity) => {
                const Icon = activityIcon(activity);
                const time = activity.kind === 'transport' ? activity.transport?.departTime : activity.startTime;
                return (
                  <li key={activity.id} className={next?.id === activity.id ? 'is-next' : undefined}>
                    <span className="travel-time tabular">{time ?? (activity.timeSlot === 'anytime' ? '' : SLOTS[activity.timeSlot])}</span>
                    <span className="travel-dot" style={{ background: activityColor(activity) }}><Icon size={13} aria-hidden /></span>
                    <div className="travel-item">
                      <strong>{activity.title}</strong>
                      {activity.kind === 'note' && activity.notes ? <p className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{activity.notes}</p> : null}
                      {activity.kind === 'place' && activity.place ? (
                        <a className="small" href={directionsLink(activity.place)} target="_blank" rel="noopener noreferrer"><MapPin size={12} aria-hidden /> {activity.place.name !== activity.title ? activity.place.name : 'Directions'}</a>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : <p className="muted">Nothing planned for this day.</p>}
        </section>

        {tonight ? (
          <section className="travel-card" aria-labelledby="stay-title">
            <div className="travel-card-head"><BedDouble size={20} aria-hidden style={{ color: 'var(--cat-stay)' }} /><h2 id="stay-title">Tonight: {tonight.stay.name}</h2></div>
            <p className="small muted">Night {tonight.night} of {tonight.nights}{tonight.isCheckIn && tonight.stay.checkInTime ? ` · check-in from ${tonight.stay.checkInTime}` : ''}</p>
            {tonight.stay.place?.address ? <p>{tonight.stay.place.address}</p> : null}
            <PlaceActions place={tonight.stay.place} onCopy={copy} />
            <div className="travel-actions">
              {tonight.stay.phone ? <a className="btn" href={`tel:${tonight.stay.phone.replace(/[^\d+]/g, '')}`}><Phone size={16} aria-hidden /> Call</a> : null}
              {tonight.stay.email ? <a className="btn" href={`mailto:${tonight.stay.email}`}><Mail size={16} aria-hidden /> Email</a> : null}
            </div>
            {tonight.stay.bookingReference ? <p className="small">Booking reference <code>{tonight.stay.bookingReference}</code> <button type="button" className="link-button" onClick={() => void copy(tonight.stay.bookingReference!, 'Reference')}>Copy</button></p> : null}
            <TicketLinks aggregate={aggregate} stayId={tonight.stay.id} />
          </section>
        ) : null}

        {aggregate.trip.notes.trim() ? (
          <details className="travel-card">
            <summary><strong>Trip notes</strong></summary>
            <p style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{aggregate.trip.notes}</p>
          </details>
        ) : null}
      </main>
    </div>
  );
}

function PlaceActions({ place, onCopy }: { place: PlaceRef | null; onCopy: (text: string, what: string) => void }) {
  if (!place) return null;
  return (
    <div className="travel-actions">
      <a className="btn btn-primary" href={directionsLink(place)} target="_blank" rel="noopener noreferrer"><Navigation size={16} aria-hidden /> Directions</a>
      <a className="btn" href={mapsLink(place)} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden /> Map</a>
      {place.address ?? place.name ? <button type="button" className="btn" onClick={() => onCopy(place.address ?? place.name, 'Address')}><Copy size={16} aria-hidden /> Copy address</button> : null}
    </div>
  );
}

function TicketLinks({ aggregate, activity, stayId }: { aggregate: TripAggregate; activity?: Activity; stayId?: string }) {
  const files = attachmentsFor(aggregate, activity ? { activityId: activity.id } : { stayId });
  if (!files.length) return null;
  return (
    <div className="travel-actions">
      {files.map((file) => <a key={file.id} className="btn btn-soft" href={fileUrl(file.id)} target="_blank" rel="noopener">{file.category === 'ticket' ? <Ticket size={16} aria-hidden /> : <FileText size={16} aria-hidden />} {file.fileName}</a>)}
    </div>
  );
}
