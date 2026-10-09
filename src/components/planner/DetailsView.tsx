'use client';

import { Archive, ArchiveRestore, CalendarDays, LogOut, Share2, Trash2, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Overlay';
import { useToast } from '@/components/ui/Toast';
import { useTrip } from '@/features/trips/client/TripContext';
import { tripDatesLabel } from '@/features/trips/format';
import { tripEnd } from '@/features/trips/selectors';
import type { OperationInput } from '@/features/trips/operations';
import type { Pace } from '@/features/trips/types';

type TripPatch = Extract<OperationInput, { type: 'trip.update' }>['patch'];
import { api } from '@/lib/api-client';
import { AutoInput, AutoNumber, AutoTextarea } from './editors/fields';
import { COMMON_CURRENCIES } from './meta';
import { usePlannerUI } from './planner-state';

const INTERESTS = ['culture', 'food', 'history', 'nature', 'landscapes', 'hiking', 'museums', 'nightlife', 'shopping', 'art', 'photography', 'relaxing', 'family', 'adventure'];

export function DetailsView({ user }: { user: { id: string; email: string } }) {
  const { view: aggregate, run, canEdit, role, sync } = useTrip();
  const ui = usePlannerUI();
  const router = useRouter();
  const toast = useToast();
  const { trip } = aggregate;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const update = (patch: TripPatch, key: string, label = 'Edit trip details') => run({ type: 'trip.update', patch }, { label, coalesceKey: `trip:${key}` });

  const remove = async () => {
    try {
      await api(`/api/trips/${trip.id}`, { method: 'DELETE' });
      router.push('/');
      toast({ message: `Deleted “${trip.name}”. Restore it from My Trips → Recently deleted.` });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Could not delete the trip.', tone: 'error' });
    }
  };
  const leave = async () => {
    const me = aggregate.members.find((member) => member.userId === user.id || member.email === user.email);
    if (!me) return;
    try {
      await api(`/api/trips/${trip.id}/members?memberId=${encodeURIComponent(me.id)}`, { method: 'DELETE' });
      router.push('/');
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Could not leave the trip.', tone: 'error' });
    }
  };

  return (
    <div className="view details-view">
      <header className="view-header"><div><h2 className="display view-title">Trip details</h2><p className="muted">Everything here is optional and saves as you type.</p></div></header>
      <div className="details-grid">
        <section className="card card-pad stack" aria-labelledby="basics-title">
          <h3 id="basics-title" className="card-title">Basics</h3>
          <Field label="Trip name"><AutoInput value={trip.name} disabled={!canEdit} maxLength={120} onCommit={(value) => value.trim() && update({ name: value.trim() }, 'name', 'Rename trip')} /></Field>
          <div className="field">
            <span className="field-label">Dates</span>
            <Button icon={<CalendarDays size={16} />} disabled={!canEdit} onClick={() => ui.openDialog('dates')} style={{ justifyContent: 'flex-start' }}>
              {tripDatesLabel({ startDate: trip.startDate, endDate: tripEnd(aggregate), dayCount: aggregate.days.length, dateMode: trip.dateMode })}
            </Button>
          </div>
          <div className="field-row">
            <Field label="Travellers"><AutoNumber value={trip.travellers} min={1} disabled={!canEdit} onCommit={(value) => value && update({ travellers: Math.min(50, Math.max(1, Math.round(value))) }, 'travellers')} /></Field>
            <Field label="Currency" hint="Budget totals are shown in this currency.">
              <select className="select" value={trip.currency} disabled={!canEdit} onChange={(event) => update({ currency: event.target.value }, 'currency', 'Change currency')}>
                {[...new Set([trip.currency, ...COMMON_CURRENCIES])].map((code) => <option key={code}>{code}</option>)}
              </select>
            </Field>
          </div>
          <div className="field">
            <span className="field-label">Pace</span>
            <div className="segmented" role="group" aria-label="Pace">
              {(['relaxed', 'balanced', 'packed'] as Pace[]).map((pace) => <button key={pace} type="button" disabled={!canEdit} aria-pressed={trip.pace === pace} onClick={() => update({ pace: trip.pace === pace ? null : pace }, 'pace')}>{pace[0].toUpperCase() + pace.slice(1)}</button>)}
            </div>
          </div>
          <div className="field">
            <span className="field-label">Interests</span>
            <div className="chip-row">
              {INTERESTS.map((interest) => {
                const on = trip.interests.includes(interest);
                return <button key={interest} type="button" className="chip" disabled={!canEdit} aria-pressed={on} onClick={() => update({ interests: on ? trip.interests.filter((item) => item !== interest) : [...trip.interests, interest] }, 'interests')}>{interest}</button>;
              })}
            </div>
          </div>
        </section>

        <section className="card card-pad stack" aria-labelledby="notes-title">
          <h3 id="notes-title" className="card-title">Trip notes</h3>
          <p className="small muted">Packing lists, visa reminders, emergency numbers. Shown in Travel Mode.</p>
          <AutoTextarea value={trip.notes} rows={12} disabled={!canEdit} aria-labelledby="notes-title" placeholder="Write anything you want to keep with this trip…" onCommit={(value) => update({ notes: value }, 'notes', 'Edit trip notes')} />
        </section>

        <section className="card card-pad stack" aria-labelledby="people-title">
          <div className="row"><h3 id="people-title" className="card-title spacer"><Users size={16} aria-hidden style={{ verticalAlign: '-3px' }} /> People</h3><Button size="sm" icon={<Share2 size={14} />} onClick={() => ui.openDialog('share')}>Share</Button></div>
          <ul className="member-list">
            {aggregate.members.map((member) => (
              <li key={member.id}><span className="avatar">{(member.displayName ?? member.email).slice(0, 2)}</span><span className="spacer truncate">{member.displayName ?? member.email}{member.userId === user.id ? ' (you)' : ''}{!member.userId ? <span className="tiny subtle"> · invited</span> : null}</span><span className="badge">{member.role === 'owner' ? 'Owner' : member.role === 'editor' ? 'Can edit' : 'Can view'}</span></li>
            ))}
          </ul>
        </section>

        <section className="card card-pad stack" aria-labelledby="manage-title">
          <h3 id="manage-title" className="card-title">Manage</h3>
          {role === 'owner' ? (
            <>
              <Button icon={trip.archivedAt ? <ArchiveRestore size={16} /> : <Archive size={16} />} onClick={() => update({ archived: !trip.archivedAt }, 'archive', trip.archivedAt ? 'Unarchive trip' : 'Archive trip')}>{trip.archivedAt ? 'Unarchive trip' : 'Archive trip'}</Button>
              <p className="tiny subtle">Archived trips are hidden from My Trips until you choose the Archived filter.</p>
              <Button variant="danger-ghost" icon={<Trash2 size={16} />} onClick={() => setConfirmDelete(true)}>Delete trip…</Button>
            </>
          ) : (
            <Button variant="danger-ghost" icon={<LogOut size={16} />} onClick={() => void leave()}>Leave this trip</Button>
          )}
          <p className="tiny subtle">Version {trip.version} · last saved {new Date(trip.updatedAt).toLocaleString()}{sync.hasPending ? ' · saving…' : ''}</p>
        </section>
      </div>
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} danger confirmLabel="Delete trip" title={`Delete “${trip.name}”?`}
        description="It moves to Recently deleted on My Trips, where you can restore it for 30 days." onConfirm={() => void remove()} />
    </div>
  );
}
