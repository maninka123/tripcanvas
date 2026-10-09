'use client';

import { Archive, ArchiveRestore, Check, Copy, Image as ImageIcon, LogOut, MoreHorizontal, Pencil, Plus, Search, Sparkles, Trash2, Undo2, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { MobileNav } from '@/components/layout/MobileNav';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState, Field } from '@/components/ui/Field';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/Menu';
import { ConfirmDialog, Modal } from '@/components/ui/Overlay';
import { useToast } from '@/components/ui/Toast';
import { checklistItems, phaseLabel, phaseOf, tripDatesLabel, initialsOf } from '@/features/trips/format';
import type { TripAggregate, TripSummary } from '@/features/trips/types';
import { api } from '@/lib/api-client';
import { safeHref } from '@/lib/urls';

type Filter = 'all' | 'upcoming' | 'planning' | 'past' | 'shared' | 'archived' | 'deleted';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'planning', label: 'Planning' },
  { id: 'past', label: 'Past' },
  { id: 'shared', label: 'Shared with me' },
  { id: 'archived', label: 'Archived' },
  { id: 'deleted', label: 'Recently deleted' },
];

async function updateTrip(id: string, patch: Record<string, unknown>, label: string) {
  await api(`/api/trips/${id}/operations`, { method: 'POST', json: { mutationId: crypto.randomUUID(), baseVersion: 0, label, operations: [{ id: crypto.randomUUID(), type: 'trip.update', patch }] } });
}

export function TripsDashboard({ initialTrips, user }: { initialTrips: TripSummary[]; user: { name: string; email: string } }) {
  const router = useRouter();
  const toast = useToast();
  const [trips, setTrips] = useState(initialTrips);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<TripSummary | null>(null);
  const [deleting, setDeleting] = useState<TripSummary | null>(null);
  const [covering, setCovering] = useState<TripSummary | null>(null);
  const [creatingSample, setCreatingSample] = useState(false);

  const reload = async () => {
    const data = await api<{ trips: TripSummary[] }>('/api/trips');
    setTrips(data.trips);
  };

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return trips.filter((trip) => {
      if (text && ![trip.name, ...trip.destinationNames, ...trip.countries].some((value) => value.toLowerCase().includes(text))) return false;
      if (filter === 'deleted') return !!trip.deletedAt;
      if (trip.deletedAt) return false;
      if (filter === 'archived') return !!trip.archivedAt;
      if (trip.archivedAt) return false;
      if (filter === 'shared') return trip.role !== 'owner';
      if (filter === 'upcoming') return ['upcoming', 'travelling'].includes(phaseOf(trip));
      if (filter === 'planning') return phaseOf(trip) === 'planning';
      if (filter === 'past') return phaseOf(trip) === 'past';
      return true;
    });
  }, [trips, filter, query]);

  const groups = useMemo(() => {
    if (filter !== 'all' || query) return [{ title: null as string | null, trips: visible }];
    const order: { title: string; match: (trip: TripSummary) => boolean }[] = [
      { title: 'Travelling now', match: (trip) => phaseOf(trip) === 'travelling' },
      { title: 'Upcoming', match: (trip) => phaseOf(trip) === 'upcoming' },
      { title: 'Planning', match: (trip) => phaseOf(trip) === 'planning' },
      { title: 'Past', match: (trip) => phaseOf(trip) === 'past' },
    ];
    return order.map((group) => ({ title: group.title, trips: visible.filter(group.match) })).filter((group) => group.trips.length);
  }, [visible, filter, query]);

  const counts = useMemo(() => ({
    archived: trips.filter((trip) => trip.archivedAt && !trip.deletedAt).length,
    deleted: trips.filter((trip) => trip.deletedAt).length,
    shared: trips.filter((trip) => trip.role !== 'owner' && !trip.deletedAt).length,
  }), [trips]);
  const activeCount = trips.filter((trip) => !trip.deletedAt && !trip.archivedAt).length;

  const duplicate = async (trip: TripSummary) => {
    try {
      const id = crypto.randomUUID();
      await api(`/api/trips/${trip.id}/duplicate`, { method: 'POST', json: { id } });
      await reload();
      toast({ message: `Copied “${trip.name}”. Bookings in the copy are marked as planned.`, tone: 'success', action: { label: 'Open', onClick: () => router.push(`/trips/${id}`) } });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Could not copy the trip.', tone: 'error' });
    }
  };

  const setArchived = async (trip: TripSummary, archived: boolean) => {
    setTrips((items) => items.map((item) => item.id === trip.id ? { ...item, archivedAt: archived ? new Date().toISOString() : null } : item));
    try {
      await updateTrip(trip.id, { archived }, archived ? 'Archive trip' : 'Unarchive trip');
      toast({ message: archived ? `Archived “${trip.name}”.` : `“${trip.name}” is back in your trips.`, tone: 'success', action: archived ? { label: 'Undo', onClick: () => void setArchived(trip, false) } : undefined });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Could not archive the trip.', tone: 'error' });
      void reload();
    }
  };

  const remove = async (trip: TripSummary) => {
    setDeleting(null);
    setTrips((items) => items.map((item) => item.id === trip.id ? { ...item, deletedAt: new Date().toISOString() } : item));
    try {
      await api(`/api/trips/${trip.id}`, { method: 'DELETE' });
      toast({ message: `Deleted “${trip.name}”. You can restore it for 30 days.`, action: { label: 'Undo', onClick: () => void restore(trip) } });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Could not delete the trip.', tone: 'error' });
      void reload();
    }
  };

  const restore = async (trip: TripSummary) => {
    try {
      await api(`/api/trips/${trip.id}/restore`, { method: 'POST' });
      setTrips((items) => items.map((item) => item.id === trip.id ? { ...item, deletedAt: null } : item));
      toast({ message: `Restored “${trip.name}”.`, tone: 'success' });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Could not restore the trip.', tone: 'error' });
    }
  };

  const leave = async (trip: TripSummary) => {
    try {
      const data = await api<{ trip: TripAggregate }>(`/api/trips/${trip.id}`);
      const me = data.trip.members.find((member) => member.email === user.email);
      if (!me) throw new Error('You are not listed on this trip.');
      await api(`/api/trips/${trip.id}/members?memberId=${encodeURIComponent(me.id)}`, { method: 'DELETE' });
      setTrips((items) => items.filter((item) => item.id !== trip.id));
      toast({ message: `You left “${trip.name}”.`, tone: 'success' });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Could not leave the trip.', tone: 'error' });
    }
  };

  const createSample = async () => {
    setCreatingSample(true);
    try {
      const id = crypto.randomUUID();
      await api('/api/samples', { method: 'POST', json: { id } });
      router.push(`/trips/${id}`);
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Could not create the sample trip.', tone: 'error' });
      setCreatingSample(false);
    }
  };

  return (
    <>
      <AppHeader user={user} />
      <main id="main" className="page">
        <div className="page-header">
          <div className="spacer">
            <h1 className="display">My Trips</h1>
            <p>Your journeys, all in one place.</p>
          </div>
          <Link href="/trips/new" className="btn btn-primary btn-lg"><Plus size={18} aria-hidden /> New Trip</Link>
        </div>

        {trips.length === 0 ? (
          <FirstTrip onSample={createSample} creatingSample={creatingSample} />
        ) : (
          <>
            <div className="trips-toolbar">
              <div className="input-with-icon trips-search">
                <Search size={16} aria-hidden />
                <input className="input" type="search" placeholder="Search trips, places or countries" aria-label="Search trips" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
              <div className="trips-filters" role="group" aria-label="Filter trips">
                {FILTERS.filter((item) => (item.id !== 'archived' || counts.archived) && (item.id !== 'deleted' || counts.deleted) && (item.id !== 'shared' || counts.shared)).map((item) => (
                  <button key={item.id} type="button" className="chip" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>
                ))}
              </div>
            </div>
            {groups.length === 0 || groups.every((group) => !group.trips.length) ? (
              <EmptyState icon={<Search size={24} />} title={query ? 'No trips match your search' : filter === 'deleted' ? 'Nothing recently deleted' : 'No trips here yet'}>
                <p>{query ? 'Try a destination or country name.' : activeCount ? 'Try another filter.' : 'Create a trip to get started.'}</p>
              </EmptyState>
            ) : groups.map((group) => (
              <section key={group.title ?? 'results'} className="trip-group" aria-labelledby={group.title ? `group-${group.title}` : undefined}>
                {group.title ? <h2 id={`group-${group.title}`} className="trip-group-title">{group.title} <span>{group.trips.length}</span></h2> : null}
                <div className="trip-grid">
                  {group.trips.map((trip) => (
                    <TripCard key={trip.id} trip={trip}
                      onRename={() => setRenaming(trip)}
                      onDuplicate={() => void duplicate(trip)}
                      onCover={() => setCovering(trip)}
                      onArchive={() => void setArchived(trip, !trip.archivedAt)}
                      onDelete={() => setDeleting(trip)}
                      onRestore={() => void restore(trip)}
                      onLeave={() => void leave(trip)} />
                  ))}
                </div>
              </section>
            ))}
            {filter === 'deleted' && counts.deleted ? <p className="small subtle" style={{ marginTop: 'var(--space-4)' }}>Deleted trips are removed permanently after 30 days.</p> : null}
          </>
        )}
      </main>
      <MobileNav />
      {renaming ? <RenameDialog trip={renaming} onClose={() => setRenaming(null)} onSaved={(name) => { setTrips((items) => items.map((item) => item.id === renaming.id ? { ...item, name } : item)); setRenaming(null); }} /> : null}
      {covering ? <CoverDialog trip={covering} onClose={() => setCovering(null)} onSaved={(url) => { setTrips((items) => items.map((item) => item.id === covering.id ? { ...item, coverImageUrl: url } : item)); setCovering(null); }} /> : null}
      <ConfirmDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)} danger confirmLabel="Delete trip"
        title={`Delete “${deleting?.name ?? ''}”?`}
        description="The trip moves to Recently deleted, where you can restore it for 30 days. People you shared it with lose access."
        onConfirm={() => deleting && void remove(deleting)} />
    </>
  );
}

function TripCard({ trip, onRename, onDuplicate, onCover, onArchive, onDelete, onRestore, onLeave }: {
  trip: TripSummary; onRename: () => void; onDuplicate: () => void; onCover: () => void; onArchive: () => void; onDelete: () => void; onRestore: () => void; onLeave: () => void;
}) {
  const phase = phaseLabel(trip);
  const owner = trip.role === 'owner';
  const cover = safeHref(trip.coverImageUrl);
  const facts = checklistItems(trip.planning);
  return (
    <article className={`trip-card${trip.deletedAt ? ' is-deleted' : ''}`}>
      <Link href={trip.deletedAt ? '#' : `/trips/${trip.id}`} className="trip-card-link" aria-disabled={!!trip.deletedAt} onClick={(event) => { if (trip.deletedAt) event.preventDefault(); }}>
        <div className="trip-card-cover">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote, user-chosen cover images
            <img src={cover} alt="" loading="lazy" referrerPolicy="no-referrer" />
          ) : (
            <div className="trip-card-placeholder" aria-hidden><span>{initialsOf(trip.name)}</span></div>
          )}
          <div className="trip-card-badges">
            <span className={`badge badge-${phase.tone === 'neutral' ? 'outline' : phase.tone}`}>{phase.label}</span>
            {trip.isSample ? <span className="badge badge-accent"><Sparkles aria-hidden /> Sample</span> : null}
            {!owner ? <span className="badge badge-info"><Users aria-hidden /> {trip.role === 'editor' ? 'Can edit' : 'View only'}</span> : null}
          </div>
        </div>
        <div className="trip-card-body">
          <h3 className="trip-card-title">{trip.name}</h3>
          <p className="trip-card-dates">{tripDatesLabel(trip)}{trip.dateMode === 'fixed' && trip.startDate ? ` · ${trip.dayCount} ${trip.dayCount === 1 ? 'day' : 'days'}` : ''}</p>
          <p className="trip-card-route truncate">{trip.destinationNames.length ? trip.destinationNames.join(' → ') : 'No destinations yet'}</p>
          {!owner && trip.ownerName ? <p className="tiny subtle">Shared by {trip.ownerName}</p> : null}
          {facts.length ? (
            <ul className="trip-card-facts" aria-label="Planning progress">
              {facts.map((fact) => <li key={fact.label} className={fact.done ? 'is-done' : undefined}>{fact.done ? <Check size={12} aria-hidden /> : null}{fact.label}</li>)}
            </ul>
          ) : null}
        </div>
      </Link>
      <div className="trip-card-menu">
        {trip.deletedAt ? (
          <Button size="sm" icon={<Undo2 size={14} />} onClick={onRestore}>Restore</Button>
        ) : (
          <Menu label={`Actions for ${trip.name}`} trigger={<IconButton label={`More actions for ${trip.name}`} size="sm" className="trip-card-menu-btn"><MoreHorizontal size={18} /></IconButton>}>
            {trip.role !== 'viewer' ? <MenuItem icon={<Pencil size={16} />} onSelect={onRename}>Rename</MenuItem> : null}
            <MenuItem icon={<Copy size={16} />} onSelect={onDuplicate}>Duplicate</MenuItem>
            {trip.role !== 'viewer' ? <MenuItem icon={<ImageIcon size={16} />} onSelect={onCover}>Change cover</MenuItem> : null}
            {owner ? <MenuItem icon={trip.archivedAt ? <ArchiveRestore size={16} /> : <Archive size={16} />} onSelect={onArchive}>{trip.archivedAt ? 'Unarchive' : 'Archive'}</MenuItem> : null}
            <MenuSeparator />
            {owner ? <MenuItem icon={<Trash2 size={16} />} danger onSelect={onDelete}>Delete…</MenuItem> : <MenuItem icon={<LogOut size={16} />} danger onSelect={onLeave}>Leave trip</MenuItem>}
          </Menu>
        )}
      </div>
    </article>
  );
}

function FirstTrip({ onSample, creatingSample }: { onSample: () => void; creatingSample: boolean }) {
  return (
    <div className="first-trip card">
      <div className="first-trip-copy">
        <h2 className="display">Where are you going next?</h2>
        <p>Start with a destination and rough dates. You can add places, day plans, transport, stays and budget whenever you are ready.</p>
        <ol className="first-trip-steps">
          <li><strong>Add destinations</strong> and how many days in each.</li>
          <li><strong>Collect places</strong> and drag them into days.</li>
          <li><strong>See it on the map</strong>, then take it with you in Travel Mode.</li>
        </ol>
        <div className="row-wrap">
          <Link href="/trips/new" className="btn btn-primary btn-lg"><Plus size={18} aria-hidden /> Plan your first trip</Link>
          <Button size="lg" variant="ghost" icon={<Sparkles size={18} />} loading={creatingSample} onClick={onSample}>Explore a sample trip</Button>
        </div>
        <p className="tiny subtle">The sample is a 14-day China itinerary added to your account, clearly marked as a sample. Delete it any time.</p>
      </div>
      <div className="first-trip-art" aria-hidden>
        <svg viewBox="0 0 320 240" width="100%" height="100%">
          <rect x="0" y="0" width="320" height="240" rx="20" fill="#e3ede6" />
          <path d="M40 190 C90 150 110 80 170 90 S250 160 285 60" fill="none" stroke="#1f4d3a" strokeWidth="3" strokeDasharray="2 9" strokeLinecap="round" />
          {[[40, 190], [170, 90], [285, 60]].map(([x, y], index) => (
            <g key={index}><circle cx={x} cy={y} r="13" fill={index === 2 ? '#b5552d' : '#1f4d3a'} /><text x={x} y={y + 4.5} textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">{index + 1}</text></g>
          ))}
          <rect x="196" y="150" width="104" height="62" rx="12" fill="#fff" />
          <rect x="208" y="163" width="56" height="8" rx="4" fill="#cbc3b2" />
          <rect x="208" y="179" width="80" height="6" rx="3" fill="#e3ddd0" />
          <rect x="208" y="192" width="64" height="6" rx="3" fill="#e3ddd0" />
        </svg>
      </div>
    </div>
  );
}

function RenameDialog({ trip, onClose, onSaved }: { trip: TripSummary; onClose: () => void; onSaved: (name: string) => void }) {
  const toast = useToast();
  const [name, setName] = useState(trip.name);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const next = name.trim();
    if (!next) return;
    setBusy(true);
    try {
      await updateTrip(trip.id, { name: next }, 'Rename trip');
      onSaved(next);
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Could not rename the trip.', tone: 'error' });
      setBusy(false);
    }
  };
  return (
    <Modal open onOpenChange={(open) => !open && onClose()} title="Rename trip" size="sm" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!name.trim()} onClick={() => void save()}>Save</Button></>}>
      <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <Field label="Trip name" error={!name.trim() ? 'Give the trip a name' : null}><input className="input" value={name} maxLength={120} autoFocus onChange={(event) => setName(event.target.value)} /></Field>
      </form>
    </Modal>
  );
}

function CoverDialog({ trip, onClose, onSaved }: { trip: TripSummary; onClose: () => void; onSaved: (url: string | null) => void }) {
  const toast = useToast();
  const [options, setOptions] = useState<{ url: string; label: string; credit: string | null }[] | null>(null);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api<{ trip: TripAggregate }>(`/api/trips/${trip.id}`).then((data) => {
      if (!cancelled) setOptions(data.trip.destinations.filter((destination) => destination.imageUrl).map((destination) => ({ url: destination.imageUrl!, label: destination.name, credit: destination.imageCredit })));
    }).catch(() => { if (!cancelled) setOptions([]); });
    return () => { cancelled = true; };
  }, [trip.id]);
  const save = async (url: string | null, credit: string | null) => {
    if (url !== null && !safeHref(url)) { toast({ message: 'Use a full image link starting with https://', tone: 'error' }); return; }
    setBusy(true);
    try {
      await updateTrip(trip.id, { coverImageUrl: url, coverCredit: credit }, 'Change cover');
      onSaved(url);
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Could not change the cover.', tone: 'error' });
      setBusy(false);
    }
  };
  return (
    <Modal open onOpenChange={(open) => !open && onClose()} title="Change cover" description="Choose a destination photo or paste a link to an image." size="lg">
      {options?.length ? (
        <div className="cover-options">
          {options.map((option) => (
            <button key={option.url} type="button" className="cover-option" disabled={busy} onClick={() => void save(option.url, option.credit)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- destination photos from Wikimedia */}
              <img src={option.url} alt="" loading="lazy" referrerPolicy="no-referrer" />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : <p className="small muted">No destination photos yet. Paste an image link below.</p>}
      <form className="row" onSubmit={(event) => { event.preventDefault(); void save(custom.trim(), null); }}>
        <input className="input" type="url" inputMode="url" placeholder="https://…" aria-label="Image link" value={custom} onChange={(event) => setCustom(event.target.value)} />
        <Button type="submit" variant="primary" disabled={!custom.trim()} loading={busy}>Use link</Button>
      </form>
      {trip.coverImageUrl ? <Button variant="ghost" onClick={() => void save(null, null)}>Remove cover</Button> : null}
    </Modal>
  );
}
