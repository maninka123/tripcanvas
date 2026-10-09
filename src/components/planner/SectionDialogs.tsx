'use client';

import { Layers } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Overlay';
import { useToast } from '@/components/ui/Toast';
import type { SectionDetail, SectionSummary } from '@/features/sections/sections';
import { useTrip } from '@/features/trips/client/TripContext';
import { orderedDestinations } from '@/features/trips/selectors';
import { api } from '@/lib/api-client';
import { usePlannerUI } from './planner-state';

export function SectionPreview({ section }: { section: SectionDetail }) {
  return (
    <ol className="section-preview">
      {section.payload.days.map((day, index) => (
        <li key={index}>
          <strong>Day {index + 1} · {section.payload.destinations[day.destinationIndex]?.name}</strong>{day.title ? ` — ${day.title}` : ''}
          {day.activities.length ? <span className="small muted" style={{ display: 'block' }}>{day.activities.filter((activity) => activity.kind !== 'note').map((activity) => activity.title).join(' · ') || 'Notes only'}</span> : null}
        </li>
      ))}
    </ol>
  );
}

export function InsertSectionDialog() {
  const { view: aggregate, run } = useTrip();
  const ui = usePlannerUI();
  const toast = useToast();
  const destinations = orderedDestinations(aggregate);
  const [sections, setSections] = useState<SectionSummary[] | null>(null);
  const [selected, setSelected] = useState<SectionDetail | null>(null);
  const [index, setIndex] = useState(destinations.length);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ sections: SectionSummary[] }>('/api/library/sections').then((data) => setSections(data.sections)).catch((cause) => { setSections([]); setError(cause instanceof Error ? cause.message : 'Could not load sections.'); });
  }, []);

  const pick = async (id: string) => {
    try { setSelected((await api<{ section: SectionDetail }>(`/api/library/sections/${id}`)).section); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load the section.'); }
  };

  const insert = () => {
    if (!selected) return;
    if (run({ type: 'section.insert', index, section: selected.payload }, { label: `Insert ${selected.name}` })) {
      ui.openDialog(null);
      toast({ message: `Inserted “${selected.name}”. Later days moved to make room.`, tone: 'success' });
    }
  };

  return (
    <Modal open onOpenChange={(open) => !open && ui.openDialog(null)} size="lg" title={selected ? selected.name : 'Insert a section'}
      description={selected ? `${selected.dayCount} days · ${selected.destinationNames.join(' → ')}` : 'Reuse days you planned before, or start from a ready-made section. The original is never changed.'}
      footer={selected ? <><Button onClick={() => setSelected(null)}>Back</Button><Button variant="primary" icon={<Layers size={16} />} onClick={insert}>Insert {selected.dayCount} days</Button></> : null}>
      {error ? <div className="notice notice-danger">{error}</div> : null}
      {!selected ? (
        sections === null ? <p className="muted">Loading…</p> : (
          <ul className="section-list">
            {sections.map((section) => (
              <li key={section.id}>
                <button type="button" className="section-option" onClick={() => void pick(section.id)}>
                  <strong>{section.name}</strong>
                  <span className="small muted">{section.dayCount} days · {section.destinationNames.join(' → ')}</span>
                  {section.starter ? <span className="badge badge-accent">Starter</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          <Field label="Insert">
            <select className="select" value={index} onChange={(event) => setIndex(Number(event.target.value))}>
              <option value={0}>At the start of the trip</option>
              {destinations.map((destination, position) => <option key={destination.id} value={position + 1}>After {destination.name}{destination.endDay ? ` (day ${destination.endDay})` : ''}</option>)}
            </select>
          </Field>
          <SectionPreview section={selected} />
          <p className="tiny subtle">Bookings are not copied: anything booked in the section is added as “to book”.</p>
        </>
      )}
    </Modal>
  );
}

export function SaveSectionDialog() {
  const { view: aggregate } = useTrip();
  const ui = usePlannerUI();
  const toast = useToast();
  const destinations = orderedDestinations(aggregate).filter((destination) => destination.startDay !== null);
  const [chosen, setChosen] = useState<string[]>(destinations[0] ? [destinations[0].id] : []);
  const [name, setName] = useState(destinations[0] ? `${destinations[0].endDay! - destinations[0].startDay! + 1} days in ${destinations[0].name}` : '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api('/api/library/sections', { method: 'POST', json: { id: crypto.randomUUID(), fromTripId: aggregate.trip.id, destinationIds: chosen, name: name.trim() } });
      toast({ message: `Saved “${name.trim()}” to Saved Places → Sections.`, tone: 'success' });
      ui.openDialog(null);
    } catch (cause) {
      toast({ message: cause instanceof Error ? cause.message : 'Could not save the section.', tone: 'error' });
      setBusy(false);
    }
  };
  return (
    <Modal open onOpenChange={(open) => !open && ui.openDialog(null)} title="Save as a reusable section" description="Saves the chosen destinations with their days, plans and stays. Insert it into any trip later."
      footer={<><Button onClick={() => ui.openDialog(null)}>Cancel</Button><Button variant="primary" loading={busy} disabled={!chosen.length || !name.trim()} onClick={() => void save()}>Save section</Button></>}>
      <fieldset className="stack-sm">
        <legend className="field-label">Destinations</legend>
        {destinations.map((destination) => (
          <label key={destination.id} className="checkbox">
            <input type="checkbox" checked={chosen.includes(destination.id)} onChange={(event) => setChosen((current) => event.target.checked ? [...current, destination.id] : current.filter((id) => id !== destination.id))} />
            {destination.name} · days {destination.startDay}–{destination.endDay}
          </label>
        ))}
      </fieldset>
      <Field label="Section name"><input className="input" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></Field>
    </Modal>
  );
}
