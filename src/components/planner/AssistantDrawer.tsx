'use client';

import { AlertTriangle, Info, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Overlay';
import { useToast } from '@/components/ui/Toast';
import type { ReviewedChange } from '@/features/assistant/proposals';
import { useTrip } from '@/features/trips/client/TripContext';
import { api } from '@/lib/api-client';
import { usePlannerUI } from './planner-state';

type Suggestion = { suggestionId: string; summary: string; answer: string | null; warnings: string[]; changes: ReviewedChange[] };

const EXAMPLES = [
  'Add three things to do on day 2',
  'Make the busiest day more relaxed',
  'Which days have scheduling conflicts?',
  'Suggest a good order for the places on day 3',
];

/**
 * The assistant only proposes. Every change is listed for review, with
 * removals unticked by default, and nothing is applied until the traveller
 * presses Apply — as one undoable step.
 */
export function AssistantDrawer() {
  const { view: aggregate, apply } = useTrip();
  const ui = usePlannerUI();
  const toast = useToast();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  const ask = async (text: string) => {
    setLoading(true);
    setError(null);
    setSuggestion(null);
    try {
      const result = await api<Suggestion>(`/api/trips/${aggregate.trip.id}/assistant`, { method: 'POST', json: { prompt: text } });
      setSuggestion(result);
      setChosen(new Set(result.changes.filter((change) => !change.error && !change.destructive).map((change) => change.id)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The assistant is unavailable.');
    } finally {
      setLoading(false);
    }
  };

  const applyChosen = (all: boolean) => {
    if (!suggestion) return;
    const selected = suggestion.changes.filter((change) => !change.error && (all || chosen.has(change.id)));
    if (!selected.length) return;
    const ok = apply(selected.flatMap((change) => change.operations), { label: `Assistant: ${selected.length} ${selected.length === 1 ? 'change' : 'changes'}`, source: 'assistant' });
    if (!ok) return;
    void api(`/api/trips/${aggregate.trip.id}/assistant`, { method: 'PATCH', json: { suggestionId: suggestion.suggestionId, status: selected.length === suggestion.changes.length ? 'applied' : 'partially_applied' } }).catch(() => undefined);
    toast({ message: `Applied ${selected.length} ${selected.length === 1 ? 'change' : 'changes'}. Press Undo to reverse them.`, tone: 'success' });
    setSuggestion(null);
    setPrompt('');
  };

  const reject = () => {
    if (suggestion) void api(`/api/trips/${aggregate.trip.id}/assistant`, { method: 'PATCH', json: { suggestionId: suggestion.suggestionId, status: 'rejected' } }).catch(() => undefined);
    setSuggestion(null);
  };

  return (
    <Drawer open onOpenChange={(open) => !open && ui.openDialog(null)} title="Assistant"
      footer={suggestion && suggestion.changes.length ? (
        <>
          <Button onClick={reject}>Discard</Button>
          <span className="spacer" />
          <Button onClick={() => applyChosen(false)} disabled={!chosen.size}>Apply selected ({chosen.size})</Button>
          <Button variant="primary" onClick={() => applyChosen(true)} disabled={!suggestion.changes.some((change) => !change.error)}>Apply all</Button>
        </>
      ) : null}>
      <div className="notice notice-neutral"><Info size={16} aria-hidden /><span>Suggestions are reviewed before anything changes. The assistant has no live data: always check opening hours, timetables and prices.</span></div>
      <form className="stack-sm" onSubmit={(event) => { event.preventDefault(); if (prompt.trim().length >= 3) void ask(prompt.trim()); }}>
        <label className="field-label" htmlFor="assistant-prompt">What would you like help with?</label>
        <textarea id="assistant-prompt" className="textarea" rows={3} maxLength={1500} value={prompt} placeholder="e.g. Add a relaxed half-day in Lijiang with a good lunch spot" onChange={(event) => setPrompt(event.target.value)} />
        <div className="chip-row">{EXAMPLES.map((example) => <button key={example} type="button" className="chip" onClick={() => setPrompt(example)}>{example}</button>)}</div>
        <Button type="submit" variant="primary" icon={<Sparkles size={16} />} loading={loading} disabled={prompt.trim().length < 3}>{loading ? 'Thinking…' : 'Ask'}</Button>
      </form>
      {error ? <div className="notice notice-danger" role="alert">{error}</div> : null}
      {suggestion ? (
        <section className="stack" aria-label="Suggestion">
          <p>{suggestion.summary}</p>
          {suggestion.answer ? <div className="card card-pad small" style={{ whiteSpace: 'pre-wrap' }}>{suggestion.answer}</div> : null}
          {suggestion.changes.length ? (
            <ul className="proposal-list">
              {suggestion.changes.map((change) => (
                <li key={change.id} className={change.error ? 'is-invalid' : undefined}>
                  <label className="checkbox">
                    <input type="checkbox" disabled={!!change.error} checked={chosen.has(change.id)} onChange={(event) => setChosen((current) => { const next = new Set(current); if (event.target.checked) next.add(change.id); else next.delete(change.id); return next; })} />
                    <span>
                      <strong>{change.description}</strong>
                      {change.affectedDays.length ? <span className="tiny subtle"> · day {change.affectedDays.join(', ')}</span> : null}
                      {change.destructive ? <span className="badge badge-warning" style={{ marginLeft: 6 }}>Removes or shortens</span> : null}
                      {change.error ? <span className="field-error" style={{ display: 'block' }}>Can’t apply: {change.error}</span> : null}
                      {change.caveats.map((caveat) => <span key={caveat} className="tiny subtle" style={{ display: 'block' }}>{caveat}</span>)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
          {suggestion.warnings.length ? (
            <div className="notice notice-warning"><AlertTriangle size={16} aria-hidden /><ul style={{ paddingLeft: 16 }}>{suggestion.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>
          ) : null}
        </section>
      ) : null}
    </Drawer>
  );
}
