'use client';

import { useState } from 'react';
import { ChevronRight, Plus, X } from 'lucide-react';
import type { SectionTrip } from '@/lib/types';

export function SectionTripLibrary({ sections, onCreate, onOpen, onDelete }: { sections: SectionTrip[]; onCreate: (name: string, dayCount: number) => void; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [dayCount, setDayCount] = useState(3);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div><p className="eyebrow">REUSABLE ITINERARIES</p><h1>Trip library</h1><p>Build a chunk of days once — a few days in a city, a side trip — then drop it into any full trip.</p></div>
        <button className="primary-button" type="button" onClick={() => setCreating(true)}><Plus size={16}/> New section trip</button>
      </header>
      <div className="dashboard-trip-grid section-library-grid">
        {sections.map((section) => (
          <article key={section.id} className="dashboard-trip-card cover-new">
            <button type="button" className="trip-card-open" onClick={() => onOpen(section.id)} aria-label={`Open ${section.name}`}>
              <div className="trip-cover"/>
              <div className="dashboard-trip-copy">
                <div><p>SECTION TRIP</p><h3>{section.name}</h3><span>{section.days.length} day{section.days.length === 1 ? '' : 's'}</span></div>
                <ChevronRight size={18}/>
              </div>
            </button>
            <button type="button" className="trip-duplicate" title="Delete section trip" aria-label={`Delete ${section.name}`} onClick={() => onDelete(section.id)}><X size={14}/></button>
          </article>
        ))}
        {sections.length === 0 && <p className="empty-inline">No section trips yet — create one to reuse across your itineraries.</p>}
      </div>
      {creating && (
        <div className="modal-backdrop" onMouseDown={() => setCreating(false)}>
          <section className="modal-panel" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <header><div><p className="eyebrow">NEW SECTION</p><h2>Build a reusable chunk</h2></div><button onClick={() => setCreating(false)} aria-label="Close"><X size={18}/></button></header>
            <form onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; onCreate(name.trim(), dayCount); setName(''); setDayCount(3); setCreating(false); }}>
              <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 3 days in Kyoto" autoFocus required/></label>
              <label>Number of days<input type="number" min={1} max={30} value={dayCount} onChange={(e) => setDayCount(Math.max(1, Number(e.target.value)))}/></label>
              <button className="submit-button" type="submit">Create section <ChevronRight size={15}/></button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
