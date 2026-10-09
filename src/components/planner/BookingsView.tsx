'use client';

import { BedDouble, FileText, Image as ImageIcon, Lock, Paperclip, Ticket } from 'lucide-react';
import { useMemo } from 'react';
import { EmptyState } from '@/components/ui/Field';
import { formatMoney } from '@/features/budget/budget';
import { useTrip } from '@/features/trips/client/TripContext';
import { fileUrl, formatBytes } from '@/features/trips/client/files';
import type { BookingStatus } from '@/features/trips/types';
import { Attachments } from './editors/fields';
import { activityIcon, BOOKING } from './meta';
import { usePlannerUI } from './planner-state';

type Row = { id: string; kind: 'activity' | 'stay'; title: string; detail: string; day: number | null; status: BookingStatus; reference: string | null; cost: number | null; currency: string; files: number; icon: React.ReactNode };

const GROUPS: { title: string; statuses: BookingStatus[]; hint: string }[] = [
  { title: 'To book', statuses: ['planned'], hint: 'Marked as needing a booking.' },
  { title: 'Booked', statuses: ['booked'], hint: 'Confirmed — references and tickets in one place.' },
  { title: 'Ideas', statuses: ['idea'], hint: 'Might need booking once you decide.' },
  { title: 'Cancelled', statuses: ['cancelled'], hint: 'Kept for your records; not counted in the budget.' },
];

export function BookingsView() {
  const { view: aggregate, run, canEdit } = useTrip();
  const ui = usePlannerUI();
  const rows = useMemo<Row[]>(() => {
    const dayNumber = (id: string | null) => aggregate.days.find((day) => day.id === id)?.number ?? null;
    const fileCount = (owner: { activityId?: string; stayId?: string }) => aggregate.attachments.filter((file) => (owner.activityId && file.activityId === owner.activityId) || (owner.stayId && file.stayId === owner.stayId)).length;
    const activityRows = aggregate.activities.filter((activity) => activity.kind !== 'note' && activity.bookingStatus !== 'none').map((activity) => {
      const Icon = activityIcon(activity);
      return {
        id: activity.id, kind: 'activity' as const, title: activity.title,
        detail: activity.transport ? [activity.transport.operator, activity.transport.serviceNumber, activity.transport.departTime ? `departs ${activity.transport.departTime}` : null].filter(Boolean).join(' · ') : activity.place?.name ?? '',
        day: dayNumber(activity.dayId), status: activity.bookingStatus, reference: activity.bookingReference, cost: activity.cost, currency: activity.currency, files: fileCount({ activityId: activity.id }), icon: <Icon size={16} aria-hidden />,
      };
    });
    const stayRows = aggregate.stays.map((stay) => ({
      id: stay.id, kind: 'stay' as const, title: stay.name, detail: `${stay.nights} ${stay.nights === 1 ? 'night' : 'nights'}${stay.checkInTime ? ` · check-in ${stay.checkInTime}` : ''}`,
      day: dayNumber(stay.startDayId), status: stay.bookingStatus, reference: stay.bookingReference, cost: stay.cost, currency: stay.currency, files: fileCount({ stayId: stay.id }), icon: <BedDouble size={16} aria-hidden />,
    }));
    return [...activityRows, ...stayRows].sort((a, b) => (a.day ?? 999) - (b.day ?? 999));
  }, [aggregate]);

  const setStatus = (row: Row, status: BookingStatus) => {
    if (row.kind === 'stay') run({ type: 'stay.update', stayId: row.id, patch: { bookingStatus: status } }, { label: `${row.title}: ${BOOKING[status].label}` });
    else run({ type: 'activity.update', activityId: row.id, patch: { bookingStatus: status } }, { label: `${row.title}: ${BOOKING[status].label}` });
  };
  const generalFiles = aggregate.attachments.filter((file) => !file.activityId && !file.stayId);
  const linkedFiles = aggregate.attachments.filter((file) => file.activityId || file.stayId);

  return (
    <div className="view bookings-view">
      <header className="view-header">
        <div>
          <h2 className="display view-title">Bookings</h2>
          <p className="muted">Everything that needs a reservation, taken straight from your itinerary. Change a status here or on the plan itself — it is the same record.</p>
        </div>
      </header>
      {rows.length === 0 ? (
        <div className="card"><EmptyState icon={<Ticket size={24} />} title="Nothing to book yet" headingLevel={3}><p>Set a booking status on a plan, journey or stay and it will appear here.</p></EmptyState></div>
      ) : GROUPS.map((group) => {
        const items = rows.filter((row) => group.statuses.includes(row.status));
        if (!items.length) return null;
        return (
          <section key={group.title} className="card booking-group" aria-labelledby={`bookings-${group.title}`}>
            <div className="booking-group-head"><h3 id={`bookings-${group.title}`} className="card-title">{group.title} <span className="badge">{items.length}</span></h3><span className="small subtle">{group.hint}</span></div>
            <ul className="booking-rows">
              {items.map((row) => (
                <li key={row.id} className="booking-row">
                  <span className="booking-icon">{row.icon}</span>
                  <button type="button" className="booking-main" onClick={() => ui.openEditor({ type: row.kind, id: row.id })}>
                    <strong>{row.title}</strong>
                    <span className="small subtle">{[row.day ? `Day ${row.day}` : 'Not scheduled', row.detail].filter(Boolean).join(' · ')}</span>
                  </button>
                  <span className="booking-ref">{row.reference ? <code>{row.reference}</code> : <span className="tiny subtle">No reference</span>}</span>
                  <span className="booking-files">{row.files ? <><Paperclip size={13} aria-hidden /> {row.files}</> : null}</span>
                  <span className="booking-cost tabular">{row.cost ? formatMoney(row.cost, row.currency) : '—'}</span>
                  {canEdit ? (
                    <select className="select booking-status" aria-label={`Booking status for ${row.title}`} value={row.status} onChange={(event) => setStatus(row, event.target.value as BookingStatus)}>
                      {(['idea', 'planned', 'booked', 'cancelled', 'none'] as BookingStatus[]).map((status) => <option key={status} value={status}>{BOOKING[status].label}</option>)}
                    </select>
                  ) : <span className={`badge ${BOOKING[row.status].badge}`}>{BOOKING[row.status].label}</span>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <section className="card card-pad" aria-labelledby="documents-title">
        <h3 id="documents-title" className="card-title">Trip documents</h3>
        <p className="small muted" style={{ margin: '4px 0 var(--space-3)' }}><Lock size={13} aria-hidden style={{ verticalAlign: '-2px' }} /> Files are private: only people on this trip can open them. Attach tickets to a plan from its editor so they show up in Travel Mode.</p>
        {linkedFiles.length ? (
          <ul className="attachment-list" style={{ marginBottom: 'var(--space-4)' }}>
            {linkedFiles.map((file) => {
              const owner = aggregate.activities.find((activity) => activity.id === file.activityId)?.title ?? aggregate.stays.find((stay) => stay.id === file.stayId)?.name;
              return (
                <li key={file.id}>
                  {file.contentType.startsWith('image/') ? <ImageIcon size={16} aria-hidden /> : <FileText size={16} aria-hidden />}
                  <a href={fileUrl(file.id)} target="_blank" rel="noopener" className="spacer truncate">{file.fileName}</a>
                  <span className="tiny subtle">{owner ? `for ${owner}` : ''} · {formatBytes(file.sizeBytes)}</span>
                </li>
              );
            })}
          </ul>
        ) : null}
        <h4 className="editor-heading">General (insurance, visas, passports…)</h4>
        <Attachments attachments={generalFiles} owner={{}} canEdit={canEdit} />
      </section>
    </div>
  );
}
