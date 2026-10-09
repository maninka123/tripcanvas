'use client';

import { AlertTriangle, CheckCircle2, Plus, RefreshCw, Table2, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, IconButton } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { budgetSummary, EXPENSE_CATEGORIES, formatMoney } from '@/features/budget/budget';
import { useTrip } from '@/features/trips/client/TripContext';
import { makeExpense } from '@/features/trips/factory';
import type { ExpenseCategory } from '@/features/trips/types';
import { api } from '@/lib/api-client';
import { formatDayLabel } from '@/lib/dates';
import { AutoNumber } from './editors/fields';
import { COMMON_CURRENCIES, EXPENSE_CATEGORY_LABEL } from './meta';
import { usePlannerUI } from './planner-state';

// Budget is derived from the plan: every cost lives on its activity, journey,
// stay or expense. Original amounts and currencies are kept; conversions use
// the rates recorded below, each with its source and date.

export function BudgetView() {
  const { view: aggregate, run, canEdit } = useTrip();
  const ui = usePlannerUI();
  const toast = useToast();
  const summary = useMemo(() => budgetSummary(aggregate), [aggregate]);
  const currency = aggregate.trip.currency;
  const [showTable, setShowTable] = useState(false);
  const [fetching, setFetching] = useState(false);
  const money = (value: number | null) => formatMoney(value, currency);

  const budget = summary.budget;
  const usedShare = budget ? Math.min(summary.planned / budget, 1) : 0;
  const over = budget !== null && summary.planned > budget;
  const dayMax = Math.max(1, ...aggregate.days.map((day) => summary.byDay.get(day.id) ?? 0));
  const categoryMax = Math.max(1, ...EXPENSE_CATEGORIES.map((category) => summary.byCategory[category].planned));
  const currencies = [...new Set([...summary.lines.map((line) => line.currency), ...aggregate.rates.map((rate) => rate.currency)])].filter((code) => code !== currency).sort();

  const fetchRates = async () => {
    setFetching(true);
    try {
      const data = await api<{ rates: Record<string, number | null>; at: string; source: string }>(`/api/rates?base=${currency}&currencies=${currencies.join(',')}`);
      const ops = Object.entries(data.rates).filter(([, rate]) => rate).map(([code, rate]) => ({ type: 'rate.set' as const, rate: { currency: code, rate: rate!, at: data.at, source: 'provider' as const } }));
      if (ops.length) run(ops, { label: 'Update exchange rates' });
      toast({ message: `Recorded ${ops.length} reference ${ops.length === 1 ? 'rate' : 'rates'} from ${data.source}.`, tone: 'success' });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Rates are unavailable. Enter them manually.', tone: 'error' });
    } finally {
      setFetching(false);
    }
  };

  return (
    <div className="view budget-view">
      <header className="view-header">
        <div>
          <h2 className="display view-title">Budget</h2>
          <p className="muted">All amounts in {currency}. Costs come from your plans, stays and journeys, plus any extra expenses.</p>
        </div>
      </header>

      <div className="stat-tiles">
        <div className="stat-tile">
          <span className="stat-label">Planned</span>
          <strong className="stat-value tabular">{money(summary.planned)}</strong>
          <span className="stat-note">Estimates and bookings together</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Confirmed</span>
          <strong className="stat-value tabular">{money(summary.confirmed)}</strong>
          <span className="stat-note">Booked items and paid expenses</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Budget</span>
          {canEdit ? (
            <div className="input-affix stat-input">
              <AutoNumber value={budget} aria-label="Trip budget" placeholder="Set a budget" onCommit={(value) => run({ type: 'trip.update', patch: { budget: value } }, { label: 'Set budget', coalesceKey: 'budget' })} />
              <span className="input-suffix">{currency}</span>
            </div>
          ) : <strong className="stat-value tabular">{budget === null ? 'Not set' : money(budget)}</strong>}
          {budget !== null ? (
            <>
              <div className={`meter${over ? ' meter-over' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={budget} aria-valuenow={summary.planned} aria-label="Planned spend against budget"><span style={{ width: `${usedShare * 100}%` }} /></div>
              <span className={`stat-note${over ? ' is-danger' : ''}`}>
                {over ? <><AlertTriangle size={13} aria-hidden /> {money(summary.planned - budget)} over budget</> : <><CheckCircle2 size={13} aria-hidden /> {money(summary.remaining)} left</>}
              </span>
            </>
          ) : <span className="stat-note">Optional — add one to track what is left.</span>}
        </div>
      </div>

      {summary.missingRates.length ? (
        <div className="notice notice-warning" role="status">
          <AlertTriangle size={18} aria-hidden />
          <div className="spacer">
            <strong>{summary.unconverted.length} {summary.unconverted.length === 1 ? 'cost is' : 'costs are'} not included</strong> because there is no exchange rate for {summary.missingRates.join(', ')}. Add a rate below.
          </div>
        </div>
      ) : null}

      <div className="budget-grid">
        <section className="card card-pad" aria-labelledby="by-category">
          <div className="row"><h3 id="by-category" className="card-title spacer">By category</h3>
            <span className="chart-legend"><span className="swatch swatch-confirmed" /> Confirmed <span className="swatch swatch-planned" /> Estimated</span>
          </div>
          <ul className="category-bars">
            {EXPENSE_CATEGORIES.map((category) => {
              const { planned, confirmed } = summary.byCategory[category];
              return (
                <li key={category}>
                  <span className="category-name">{EXPENSE_CATEGORY_LABEL[category]}</span>
                  <span className="bar-track" aria-hidden>
                    {confirmed > 0 ? <span className="bar bar-confirmed" style={{ width: `${(confirmed / categoryMax) * 100}%` }} /> : null}
                    {planned - confirmed > 0 ? <span className="bar bar-planned" style={{ width: `${((planned - confirmed) / categoryMax) * 100}%` }} /> : null}
                  </span>
                  <span className="category-value tabular">{planned ? money(planned) : '—'}<span className="visually-hidden">{confirmed ? `, of which ${money(confirmed)} confirmed` : ''}</span></span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card card-pad" aria-labelledby="by-day">
          <div className="row">
            <h3 id="by-day" className="card-title spacer">By day</h3>
            <Button size="sm" variant="ghost" icon={<Table2 size={14} />} aria-pressed={showTable} onClick={() => setShowTable(!showTable)}>{showTable ? 'Chart' : 'Table'}</Button>
          </div>
          {showTable ? (
            <table className="data-table">
              <thead><tr><th scope="col">Day</th><th scope="col">Date</th><th scope="col" className="num">Planned</th></tr></thead>
              <tbody>
                {aggregate.days.map((day) => <tr key={day.id}><td>{day.number}</td><td>{day.date ? formatDayLabel(day.date) : '—'}</td><td className="num tabular">{money(summary.byDay.get(day.id) ?? 0)}</td></tr>)}
                {summary.unassigned ? <tr><td colSpan={2}>Not tied to a day</td><td className="num tabular">{money(summary.unassigned)}</td></tr> : null}
              </tbody>
            </table>
          ) : (
            <div className="day-bars" role="list" aria-label="Planned spend per day">
              {aggregate.days.map((day) => {
                const value = summary.byDay.get(day.id) ?? 0;
                return (
                  <button key={day.id} type="button" role="listitem" className="day-bar" onClick={() => { ui.setDayNumber(day.number); ui.setView('itinerary'); }}
                    aria-label={`Day ${day.number}: ${money(value)}`} data-tip={`Day ${day.number}${day.date ? ` · ${formatDayLabel(day.date)}` : ''}\n${money(value)}`}>
                    <span className="day-bar-fill" style={{ height: `${Math.max(value ? 3 : 0, (value / dayMax) * 100)}%` }} />
                    {aggregate.days.length <= 21 || day.number % 5 === 1 ? <span className="day-bar-label">{day.number}</span> : null}
                  </button>
                );
              })}
            </div>
          )}
          {summary.unassigned && !showTable ? <p className="tiny subtle">{money(summary.unassigned)} is not tied to a particular day.</p> : null}
        </section>
      </div>

      <Expenses />

      <section className="card card-pad" aria-labelledby="rates-title">
        <div className="row-wrap">
          <h3 id="rates-title" className="card-title spacer">Exchange rates</h3>
          {canEdit && currencies.length ? <Button size="sm" icon={<RefreshCw size={14} />} loading={fetching} onClick={() => void fetchRates()}>Fetch reference rates</Button> : null}
        </div>
        {currencies.length === 0 ? <p className="small muted">All costs are in {currency}. Rates appear here when you add costs in other currencies.</p> : (
          <table className="data-table">
            <thead><tr><th scope="col">Currency</th><th scope="col">1 unit = {currency}</th><th scope="col">Source</th></tr></thead>
            <tbody>
              {currencies.map((code) => {
                const rate = aggregate.rates.find((item) => item.currency === code);
                return (
                  <tr key={code}>
                    <th scope="row">{code}</th>
                    <td>{canEdit ? <AutoNumber value={rate?.rate ?? null} aria-label={`Rate for ${code}`} placeholder="Enter rate" onCommit={(value) => run(value ? { type: 'rate.set', rate: { currency: code, rate: value, at: new Date().toISOString(), source: 'manual' } } : { type: 'rate.remove', currency: code }, { label: `Rate for ${code}` })} /> : rate?.rate ?? '—'}</td>
                    <td className="small muted">{rate ? `${rate.source === 'provider' ? 'ExchangeRate-API' : 'Entered manually'} · ${new Date(rate.at).toLocaleDateString()}` : <span className="badge badge-warning">Missing</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="tiny subtle">Rates are recorded with the trip so totals do not change unexpectedly. Reference rates by <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">ExchangeRate-API</a>.</p>
      </section>
    </div>
  );
}

function Expenses() {
  const { view: aggregate, run, canEdit } = useTrip();
  const currency = aggregate.trip.currency;
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseCurrency, setExpenseCurrency] = useState(currency);
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [dayId, setDayId] = useState('');
  const [paid, setPaid] = useState(true);

  const add = () => {
    const value = Number(amount);
    if (!title.trim() || !Number.isFinite(value) || value < 0) return;
    const rate = aggregate.rates.find((item) => item.currency === expenseCurrency);
    if (run({ type: 'expense.add', expense: makeExpense({ id: crypto.randomUUID(), title: title.trim(), amount: value, currency: expenseCurrency, category, dayId: dayId || null, status: paid ? 'paid' : 'planned', rate: expenseCurrency === currency ? null : rate?.rate ?? null, rateSource: expenseCurrency === currency ? null : rate?.source ?? null, rateAt: expenseCurrency === currency ? null : rate?.at ?? null }) }, { label: `Add expense ${title.trim()}` })) {
      setTitle(''); setAmount('');
    }
  };

  return (
    <section className="card card-pad" aria-labelledby="expenses-title">
      <h3 id="expenses-title" className="card-title">Extra expenses</h3>
      <p className="small muted" style={{ marginBottom: 'var(--space-3)' }}>Spending that is not a plan, journey or stay — meals, SIM cards, souvenirs. Costs on plans are counted automatically.</p>
      {aggregate.expenses.length ? (
        <table className="data-table">
          <thead><tr><th scope="col">Expense</th><th scope="col">Category</th><th scope="col">Day</th><th scope="col">Status</th><th scope="col" className="num">Amount</th><th /></tr></thead>
          <tbody>
            {aggregate.expenses.map((expense) => {
              const day = aggregate.days.find((item) => item.id === expense.dayId);
              return (
                <tr key={expense.id}>
                  <td>{expense.title}</td>
                  <td>{EXPENSE_CATEGORY_LABEL[expense.category]}</td>
                  <td>{day ? `Day ${day.number}` : '—'}</td>
                  <td>{canEdit ? <button type="button" className={`badge ${expense.status === 'paid' ? 'badge-success' : 'badge-outline'}`} onClick={() => run({ type: 'expense.update', expenseId: expense.id, patch: { status: expense.status === 'paid' ? 'planned' : 'paid' } }, { label: 'Update expense' })}>{expense.status === 'paid' ? 'Paid' : 'Planned'}</button> : expense.status}</td>
                  <td className="num tabular">{formatMoney(expense.amount, expense.currency)}{expense.currency !== currency ? <span className="tiny subtle" style={{ display: 'block' }}>{expense.rate ? `≈ ${formatMoney(expense.amount * expense.rate, currency)}` : 'no rate'}</span> : null}</td>
                  <td>{canEdit ? <IconButton size="sm" label={`Delete ${expense.title}`} onClick={() => run({ type: 'expense.remove', expenseId: expense.id }, { label: `Delete expense ${expense.title}` })}><Trash2 size={14} /></IconButton> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
      {canEdit ? (
        <form className="expense-form" onSubmit={(event) => { event.preventDefault(); add(); }}>
          <Field label="Description"><input className="input" value={title} maxLength={200} placeholder="e.g. Street food" onChange={(event) => setTitle(event.target.value)} /></Field>
          <Field label="Amount">
            <div className="input-affix">
              <input className="input" type="number" min={0} step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
              <select className="select" aria-label="Currency" value={expenseCurrency} onChange={(event) => setExpenseCurrency(event.target.value)}>{[...new Set([currency, ...COMMON_CURRENCIES])].map((code) => <option key={code}>{code}</option>)}</select>
            </div>
          </Field>
          <Field label="Category"><select className="select" value={category} onChange={(event) => setCategory(event.target.value as ExpenseCategory)}>{EXPENSE_CATEGORIES.map((item) => <option key={item} value={item}>{EXPENSE_CATEGORY_LABEL[item]}</option>)}</select></Field>
          <Field label="Day" optional><select className="select" value={dayId} onChange={(event) => setDayId(event.target.value)}><option value="">Whole trip</option>{aggregate.days.map((day) => <option key={day.id} value={day.id}>Day {day.number}</option>)}</select></Field>
          <label className="checkbox"><input type="checkbox" checked={paid} onChange={(event) => setPaid(event.target.checked)} /> Already paid</label>
          <Button type="submit" variant="primary" icon={<Plus size={16} />} disabled={!title.trim() || !amount}>Add expense</Button>
        </form>
      ) : null}
    </section>
  );
}
