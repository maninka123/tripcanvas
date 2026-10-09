'use client';

import {
  AlertCircle, ArrowLeft, CalendarDays, CalendarPlus, Check, CloudOff, Copy, Download, FileText, Layers, Loader2, MoreHorizontal, Navigation, Redo2, Share2, Sparkles, Undo2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Logo } from '@/components/layout/AppHeader';
import { Button, IconButton } from '@/components/ui/Button';
import { Menu, MenuItem, MenuSeparator, Tooltip } from '@/components/ui/Menu';
import { useToast } from '@/components/ui/Toast';
import { useTrip } from '@/features/trips/client/TripContext';
import { tripDatesLabel } from '@/features/trips/format';
import { tripEnd } from '@/features/trips/selectors';
import { api } from '@/lib/api-client';
import { usePlannerUI } from './planner-state';

export function PlannerHeader({ assistantAvailable }: { assistantAvailable: boolean }) {
  const { view: aggregate, role, status, lastError, canUndo, canRedo, undoLabel, redoLabel, sync, run, canEdit } = useTrip();
  const ui = usePlannerUI();
  const router = useRouter();
  const toast = useToast();
  const { trip } = aggregate;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(trip.name);

  const commitName = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== trip.name) run({ type: 'trip.update', patch: { name: next } }, { label: 'Rename trip' });
    else setDraft(trip.name);
  };

  const duplicate = async () => {
    try {
      const id = crypto.randomUUID();
      await api(`/api/trips/${trip.id}/duplicate`, { method: 'POST', json: { id } });
      toast({ message: 'Copy created. Bookings in the copy are marked as planned.', tone: 'success', action: { label: 'Open copy', onClick: () => router.push(`/trips/${id}`) } });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Could not copy the trip.', tone: 'error' });
    }
  };

  const exportPdf = async () => {
    const { exportTripPdf } = await import('@/features/export/pdf');
    await exportTripPdf(aggregate);
  };

  return (
    <header className="planner-header">
      <div className="planner-header-row">
        <Link href="/" className="planner-back" aria-label="Back to My Trips"><ArrowLeft size={18} aria-hidden /><span className="planner-back-label">My Trips</span></Link>
        <span className="planner-logo"><Logo compact /></span>
        <div className="planner-title">
          {editing ? (
            <input className="input planner-title-input" value={draft} autoFocus aria-label="Trip name" maxLength={120}
              onChange={(event) => setDraft(event.target.value)} onBlur={commitName}
              onKeyDown={(event) => { if (event.key === 'Enter') commitName(); if (event.key === 'Escape') { setDraft(trip.name); setEditing(false); } }} />
          ) : (
            <h1>
              {canEdit ? <button type="button" className="planner-title-button" onClick={() => { setDraft(trip.name); setEditing(true); }} title="Rename trip">{trip.name}</button> : trip.name}
              {trip.isSample ? <span className="badge badge-accent" style={{ flex: "none" }}>Sample</span> : null}
            </h1>
          )}
          <button type="button" className="planner-dates" onClick={() => canEdit && ui.openDialog('dates')} disabled={!canEdit}>
            <CalendarDays size={14} aria-hidden />
            {tripDatesLabel({ startDate: trip.startDate, endDate: tripEnd(aggregate), dayCount: aggregate.days.length, dateMode: trip.dateMode })}
            {trip.dateMode === 'fixed' ? ` · ${aggregate.days.length} days` : ''}
          </button>
        </div>
        <SaveIndicator status={status} error={lastError} onRetry={() => sync.retryNow()} readOnly={role === 'viewer'} />
        <div className="planner-actions">
          {canEdit ? (
            <>
              <Tooltip label={undoLabel ? `Undo ${undoLabel.toLowerCase()} (Ctrl+Z)` : 'Nothing to undo'}><span><IconButton label="Undo" disabled={!canUndo} onClick={() => sync.undo()}><Undo2 size={18} /></IconButton></span></Tooltip>
              <Tooltip label={redoLabel ? `Redo ${redoLabel.toLowerCase()} (Ctrl+Shift+Z)` : 'Nothing to redo'}><span className="hide-mobile"><IconButton label="Redo" disabled={!canRedo} onClick={() => sync.redo()}><Redo2 size={18} /></IconButton></span></Tooltip>
            </>
          ) : <span className="badge badge-info">View only</span>}
          {assistantAvailable && canEdit ? <Button variant="soft" className="hide-mobile" icon={<Sparkles size={16} />} onClick={() => ui.openDialog('assistant')}>Assistant</Button> : null}
          <Button className="hide-mobile" icon={<Share2 size={16} />} onClick={() => ui.openDialog('share')}>Share</Button>
          <Link href={`/trips/${trip.id}/travel`} className="btn btn-primary"><Navigation size={16} aria-hidden /><span className="hide-mobile">Travel Mode</span></Link>
          <Menu label="More trip actions" trigger={<IconButton label="More trip actions" outline><MoreHorizontal size={18} /></IconButton>}>
            {assistantAvailable && canEdit ? <MenuItem icon={<Sparkles size={16} />} onSelect={() => ui.openDialog('assistant')}>Ask the assistant</MenuItem> : null}
            <MenuItem icon={<Share2 size={16} />} onSelect={() => ui.openDialog('share')}>Share</MenuItem>
            {canEdit ? <MenuItem icon={<Layers size={16} />} onSelect={() => ui.openDialog('section')}>Insert a saved section…</MenuItem> : null}
            {aggregate.destinations.length ? <MenuItem icon={<Layers size={16} />} onSelect={() => ui.openDialog('saveSection')}>Save days as a section…</MenuItem> : null}
            <MenuSeparator />
            <MenuItem icon={<FileText size={16} />} onSelect={() => void exportPdf()}>Download PDF itinerary</MenuItem>
            <MenuItem icon={<CalendarPlus size={16} />} disabled={trip.dateMode !== 'fixed'} onSelect={() => { window.location.href = `/api/trips/${trip.id}/calendar`; }}>Add to calendar (.ics)</MenuItem>
            <MenuItem icon={<Download size={16} />} onSelect={() => window.print()}>Print</MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Copy size={16} />} onSelect={() => void duplicate()}>Duplicate trip</MenuItem>
          </Menu>
        </div>
      </div>
    </header>
  );
}

function SaveIndicator({ status, error, onRetry, readOnly }: { status: string; error: string | null; onRetry: () => void; readOnly: boolean }) {
  if (readOnly) return <span className="save-indicator" />;
  if (status === 'saving') return <span className="save-indicator" role="status"><Loader2 size={14} className="spin" aria-hidden /> <span className="save-text">Saving…</span></span>;
  if (status === 'offline') return <button type="button" className="save-indicator is-warning" onClick={onRetry} title={error ?? undefined}><CloudOff size={14} aria-hidden /> <span className="save-text">Offline — will retry</span></button>;
  if (status === 'error') return <button type="button" className="save-indicator is-error" onClick={onRetry} title={error ?? undefined}><AlertCircle size={14} aria-hidden /> <span className="save-text">Not saved — retry</span></button>;
  return <span className="save-indicator is-saved" role="status"><Check size={14} aria-hidden /> <span className="save-text">Saved</span></span>;
}
