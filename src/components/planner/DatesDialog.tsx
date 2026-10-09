'use client';

import { CalendarRange } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Overlay';
import { useTrip } from '@/features/trips/client/TripContext';
import { newOp } from '@/features/trips/operations';
import { applyOperations, OperationError } from '@/features/trips/reducer';
import { tripEnd } from '@/features/trips/selectors';
import { formatDateRange, inclusiveDayCount, isIsoDate, MAX_TRIP_DAYS, tripEndDate } from '@/lib/dates';
import { usePlannerUI } from './planner-state';

export function DatesDialog() {
  const { view: aggregate, apply } = useTrip();
  const ui = usePlannerUI();
  const { trip } = aggregate;
  const [mode, setMode] = useState(trip.dateMode);
  const [start, setStart] = useState(trip.startDate ?? '');
  const [end, setEnd] = useState(tripEnd(aggregate) ?? '');
  const [count, setCount] = useState(aggregate.days.length);
  const close = () => ui.openDialog(null);

  const dayCount = mode === 'fixed' ? (isIsoDate(start) && isIsoDate(end) && end >= start ? inclusiveDayCount(start, end) : 0) : count;
  const error = mode === 'fixed' && start && end && end < start ? 'The end date is before the start date.' : dayCount > MAX_TRIP_DAYS ? `Trips can be up to ${MAX_TRIP_DAYS} days.` : mode === 'fixed' && (!start || !end) ? null : dayCount < 1 ? 'A trip needs at least one day.' : null;

  // Preview the effect before anything changes.
  const preview = useMemo(() => {
    if (error || dayCount < 1 || (mode === 'fixed' && !start)) return null;
    const operation = newOp({ type: 'trip.setDates', dateMode: mode, startDate: mode === 'fixed' ? start : null, dayCount });
    try {
      return { operation, notices: applyOperations(aggregate, [operation]).notices };
    } catch (cause) {
      return { operation: null, notices: [cause instanceof OperationError ? cause.message : 'These dates cannot be applied.'] };
    }
  }, [aggregate, mode, start, dayCount, error]);

  const save = () => {
    if (!preview?.operation) return;
    if (apply([preview.operation], { label: 'Change dates' })) close();
  };

  return (
    <Modal open onOpenChange={(open) => !open && close()} title="Trip dates" description="Change dates or switch to flexible days. Plans are never deleted — anything on removed days moves to Ideas."
      footer={<><Button onClick={close}>Cancel</Button><Button variant="primary" disabled={!preview?.operation} onClick={save}>Save dates</Button></>}>
      <div className="segmented" role="group" aria-label="Date type">
        <button type="button" aria-pressed={mode === 'fixed'} onClick={() => setMode('fixed')}>Exact dates</button>
        <button type="button" aria-pressed={mode === 'flexible'} onClick={() => setMode('flexible')}>Flexible</button>
      </div>
      {mode === 'fixed' ? (
        <div className="field-row">
          <Field label="Start"><input className="input" type="date" value={start} onChange={(event) => { const next = event.target.value; const length = Math.max(1, aggregate.days.length); setStart(next); if (isIsoDate(next)) setEnd(tripEndDate(next, length) ?? ''); }} /></Field>
          <Field label="End" error={error}><input className="input" type="date" value={end} min={start || undefined} onChange={(event) => setEnd(event.target.value)} /></Field>
        </div>
      ) : (
        <Field label="Number of days" error={error}><input className="input" type="number" min={1} max={MAX_TRIP_DAYS} value={count} onChange={(event) => setCount(Number(event.target.value))} style={{ maxWidth: 160 }} /></Field>
      )}
      {preview ? (
        <div className={`notice ${preview.notices.length ? 'notice-warning' : 'notice-neutral'}`}>
          <CalendarRange size={18} aria-hidden />
          <div>
            <strong>{dayCount} days{mode === 'fixed' && start ? ` · ${formatDateRange(start, tripEndDate(start, dayCount))}` : ''}</strong>
            {preview.notices.map((notice) => <div key={notice}>{notice}</div>)}
            {!preview.notices.length && dayCount > aggregate.days.length ? <div>{dayCount - aggregate.days.length} new {dayCount - aggregate.days.length === 1 ? 'day is' : 'days are'} added at the end, without a destination.</div> : null}
            {!preview.notices.length && dayCount === aggregate.days.length ? <div>Same number of days; every plan keeps its day.</div> : null}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
