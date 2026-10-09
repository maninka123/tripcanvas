'use client';

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CalendarRange, Sparkles, SquarePen, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { PlaceSearch, type PlaceResult } from '@/components/places/PlaceSearch';
import { Button, IconButton } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { destinationFrom, fetchDestinationInfo, shortIntro } from '@/features/places/convert';
import { defaultTripName, splitDays } from '@/features/trips/create';
import { DESTINATION_COLORS } from '@/features/trips/reducer';
import { api } from '@/lib/api-client';
import { formatDateRange, inclusiveDayCount, isIsoDate, MAX_TRIP_DAYS, tripEndDate } from '@/lib/dates';

type Chosen = ReturnType<typeof destinationFrom> & { imageUrl: string | null; imageCredit: string | null; description: string | null };

const CURRENCIES = ['AUD', 'USD', 'EUR', 'GBP', 'CNY', 'JPY', 'NZD', 'CAD', 'SGD', 'INR', 'LKR', 'THB', 'KRW', 'HKD', 'CHF'];

export function NewTripFlow({ user, assistantAvailable }: { user: { name: string; email: string }; assistantAvailable: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [tripId] = useState(() => crypto.randomUUID());
  const [destinations, setDestinations] = useState<Chosen[]>([]);
  const [dateMode, setDateMode] = useState<'fixed' | 'flexible'>('fixed');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [flexibleDays, setFlexibleDays] = useState(7);
  const [plan, setPlan] = useState<'empty' | 'assistant'>('empty');
  const [name, setName] = useState('');
  const [travellers, setTravellers] = useState(1);
  const [budget, setBudget] = useState('');
  const [currency, setCurrency] = useState('AUD');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addDestination = (place: PlaceResult) => {
    if (destinations.some((destination) => destination.providerId && destination.providerId === place.providerId)) {
      toast({ message: `${place.name} is already in your list.` });
      return;
    }
    const chosen: Chosen = { ...destinationFrom(place), imageUrl: null, imageCredit: null, description: null };
    setDestinations((items) => [...items, chosen]);
    void fetchDestinationInfo(place.name, { lat: place.lat, lng: place.lng }).then((info) => {
      if (!info) return;
      setDestinations((items) => items.map((item) => item.id === chosen.id ? { ...item, imageUrl: info.imageUrl, imageCredit: info.imageUrl ? `${info.credit}: ${info.sourceUrl}` : null, description: shortIntro(info.extract, 3) } : item));
    });
  };

  const move = (index: number, delta: number) => setDestinations((items) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    return next;
  });

  const dateError = useMemo(() => {
    if (dateMode === 'flexible') return flexibleDays < 1 || flexibleDays > MAX_TRIP_DAYS ? `Choose between 1 and ${MAX_TRIP_DAYS} days.` : null;
    if (!startDate || !endDate) return null;
    if (!isIsoDate(startDate) || !isIsoDate(endDate)) return 'Enter valid dates.';
    if (endDate < startDate) return 'The return date is before the start date.';
    if (inclusiveDayCount(startDate, endDate) > MAX_TRIP_DAYS) return `Trips can be up to ${MAX_TRIP_DAYS} days. Split a longer journey into several trips.`;
    return null;
  }, [dateMode, startDate, endDate, flexibleDays]);

  const dayCount = dateMode === 'fixed' ? (startDate && endDate && !dateError ? inclusiveDayCount(startDate, endDate) : 0) : flexibleDays;
  const datesReady = dateMode === 'flexible' ? !dateError : !!startDate && !!endDate && !dateError;
  const split = splitDays(Math.max(dayCount, destinations.length), destinations.length);

  const create = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const budgetValue = budget.trim() ? Number(budget) : null;
      await api('/api/trips', {
        method: 'POST',
        json: {
          id: tripId,
          name: name.trim() || undefined,
          currency,
          dateMode,
          startDate: dateMode === 'fixed' ? startDate : null,
          dayCount: Math.max(1, dayCount),
          travellers,
          budget: budgetValue !== null && Number.isFinite(budgetValue) && budgetValue >= 0 ? budgetValue : null,
          destinations: destinations.map((destination, index) => ({ ...destination, color: DESTINATION_COLORS[index % DESTINATION_COLORS.length] })),
        },
      });
      router.push(`/trips/${tripId}${plan === 'assistant' ? '?assistant=1' : '?welcome=1'}`);
    } catch (cause) {
      // Everything entered stays on screen; retrying reuses the same trip id, so it cannot duplicate.
      setError(cause instanceof Error ? cause.message : 'The trip could not be created. Please try again.');
      setSubmitting(false);
    }
  };

  const steps = ['Where', 'When', 'How'];
  const canContinue = step === 0 ? destinations.length > 0 || name.trim().length > 0 : step === 1 ? datesReady : true;

  return (
    <>
      <AppHeader user={user} />
      <main id="main" className="new-trip">
        <div className="new-trip-progress" aria-label={`Step ${step + 1} of 3: ${steps[step]}`}>
          {steps.map((label, index) => <span key={label} className={index <= step ? 'is-done' : undefined} />)}
        </div>

        {step === 0 ? (
          <section className="new-trip-step" aria-labelledby="where-title">
            <div>
              <h1 id="where-title" className="display">Where are you going?</h1>
              <p className="new-trip-lead">Add the cities or regions you will visit, in order. You can change them any time.</p>
            </div>
            <PlaceSearch scope="locality" autoFocus label="Search for a city, region or country" placeholder="e.g. Shanghai, Lijiang, Kyoto…" onSelect={addDestination} />
            {destinations.length ? (
              <ol className="chosen-destinations" aria-label="Destinations in order">
                {destinations.map((destination, index) => (
                  <li key={destination.id} className="chosen-destination">
                    <span className="num" style={{ background: DESTINATION_COLORS[index % DESTINATION_COLORS.length] }}>{index + 1}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element -- Wikimedia thumbnails */}
                    {destination.imageUrl ? <img src={destination.imageUrl} alt="" referrerPolicy="no-referrer" /> : null}
                    <div className="spacer" style={{ minWidth: 0 }}>
                      <strong className="truncate" style={{ display: 'block' }}>{destination.name}</strong>
                      <span className="small subtle">{destination.country || 'Location found'}</span>
                    </div>
                    <IconButton size="sm" label={`Move ${destination.name} earlier`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} /></IconButton>
                    <IconButton size="sm" label={`Move ${destination.name} later`} disabled={index === destinations.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} /></IconButton>
                    <IconButton size="sm" label={`Remove ${destination.name}`} onClick={() => setDestinations((items) => items.filter((item) => item.id !== destination.id))}><X size={16} /></IconButton>
                  </li>
                ))}
              </ol>
            ) : (
              <Field label="Or just name the trip for now" optional hint="Useful if you have not decided where to go yet.">
                <input className="input" value={name} maxLength={120} placeholder="e.g. Summer in Europe" onChange={(event) => setName(event.target.value)} />
              </Field>
            )}
          </section>
        ) : null}

        {step === 1 ? (
          <section className="new-trip-step" aria-labelledby="when-title">
            <div>
              <h1 id="when-title" className="display">When are you travelling?</h1>
              <p className="new-trip-lead">Pick dates, or keep them flexible and plan by day number.</p>
            </div>
            <div className="segmented date-mode" role="group" aria-label="Date type">
              <button type="button" aria-pressed={dateMode === 'fixed'} onClick={() => setDateMode('fixed')}><CalendarRange size={16} aria-hidden /> Exact dates</button>
              <button type="button" aria-pressed={dateMode === 'flexible'} onClick={() => setDateMode('flexible')}>Flexible dates</button>
            </div>
            {dateMode === 'fixed' ? (
              <div className="field-row">
                <Field label="Start"><input className="input" type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); if (!endDate || event.target.value > endDate) setEndDate(event.target.value); }} /></Field>
                <Field label="End" error={dateError}><input className="input" type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} /></Field>
              </div>
            ) : (
              <Field label="How many days?" error={dateError} hint="Days are numbered until you set dates.">
                <input className="input" type="number" min={1} max={MAX_TRIP_DAYS} value={flexibleDays} onChange={(event) => setFlexibleDays(Number(event.target.value))} style={{ maxWidth: 160 }} />
              </Field>
            )}
            {dayCount > 0 && !dateError ? (
              <div className="notice notice-neutral">
                <CalendarRange size={18} aria-hidden />
                <div>
                  <strong>{dayCount} {dayCount === 1 ? 'day' : 'days'}</strong>{dateMode === 'fixed' ? ` · ${formatDateRange(startDate, tripEndDate(startDate, dayCount))}` : ''}
                  {destinations.length > 1 ? <div>{destinations.map((destination, index) => `${destination.name} ${split[index]}d`).join(' → ')} — adjust in the planner.</div> : null}
                  {destinations.length > dayCount ? <div>The trip will be extended to {destinations.length} days so each destination has at least one.</div> : null}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {step === 2 ? (
          <section className="new-trip-step" aria-labelledby="how-title">
            <div>
              <h1 id="how-title" className="display">How would you like to plan?</h1>
              <p className="new-trip-lead">Either way, everything stays editable.</p>
            </div>
            <div className="plan-choices" role="group" aria-label="Planning style">
              <button type="button" className="plan-choice" aria-pressed={plan === 'empty'} onClick={() => setPlan('empty')}>
                <strong><SquarePen size={18} aria-hidden /> Start with an empty trip</strong>
                <span>Days are ready for each destination. Add places as you find them.</span>
              </button>
              <button type="button" className="plan-choice" aria-pressed={plan === 'assistant'} disabled={!assistantAvailable} onClick={() => setPlan('assistant')}>
                <strong><Sparkles size={18} aria-hidden /> Help me plan</strong>
                <span>{assistantAvailable ? 'The assistant suggests a first draft. You review every change before it is applied.' : 'The AI assistant is not configured on this server. You can still insert ready-made sections from Saved Places.'}</span>
              </button>
            </div>
            <details className="card card-pad">
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Optional details</summary>
              <div className="stack" style={{ marginTop: 'var(--space-4)' }}>
                <Field label="Trip name" optional hint={destinations.length ? `Leave blank to use “${defaultTripName(destinations)}”.` : undefined}>
                  <input className="input" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
                </Field>
                <div className="field-row">
                  <Field label="Travellers"><input className="input" type="number" min={1} max={50} value={travellers} onChange={(event) => setTravellers(Math.max(1, Math.min(50, Number(event.target.value) || 1)))} /></Field>
                  <Field label="Budget" optional>
                    <div className="input-affix">
                      <input className="input" type="number" min={0} inputMode="decimal" value={budget} placeholder="No budget" onChange={(event) => setBudget(event.target.value)} />
                      <select className="select" aria-label="Currency" value={currency} onChange={(event) => setCurrency(event.target.value)}>{CURRENCIES.map((code) => <option key={code}>{code}</option>)}</select>
                    </div>
                  </Field>
                </div>
              </div>
            </details>
            {error ? <div className="notice notice-danger" role="alert">{error}</div> : null}
          </section>
        ) : null}

        <div className="new-trip-footer">
          {step > 0 ? <Button icon={<ArrowLeft size={16} />} onClick={() => setStep(step - 1)} disabled={submitting}>Back</Button> : <Button variant="ghost" onClick={() => router.push('/')}>Cancel</Button>}
          <div className="spacer" />
          {step === 1 && dateMode === 'fixed' && !datesReady ? <Button variant="ghost" onClick={() => setDateMode('flexible')}>I don’t know yet</Button> : null}
          {step < 2
            ? <Button variant="primary" size="lg" disabled={!canContinue} onClick={() => setStep(step + 1)}>Continue <ArrowRight size={16} aria-hidden /></Button>
            : <Button variant="primary" size="lg" loading={submitting} onClick={() => void create()}>Create trip</Button>}
        </div>
      </main>
    </>
  );
}
