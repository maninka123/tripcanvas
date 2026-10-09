import type { Activity, ExpenseCategory, Stay, TripAggregate } from '@/features/trips/types';

// Budget is derived, never stored: every cost lives on the item it belongs to
// (an activity, a journey, a stay, or a standalone expense). Original amounts
// and currencies are kept; conversion uses the trip's recorded rates.

export type BudgetLine = {
  id: string;
  source: 'activity' | 'transport' | 'stay' | 'expense';
  title: string;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  /** Amount in the trip currency, or null if no rate is recorded for `currency`. */
  converted: number | null;
  confirmed: boolean;
  dayId: string | null;
};

export type BudgetSummary = {
  currency: string;
  lines: BudgetLine[];
  planned: number;
  confirmed: number;
  budget: number | null;
  remaining: number | null;
  byCategory: Record<ExpenseCategory, { planned: number; confirmed: number }>;
  byDay: Map<string, number>;
  unassigned: number;
  /** Lines that could not be converted because no rate is recorded. */
  unconverted: BudgetLine[];
  missingRates: string[];
};

export const EXPENSE_CATEGORIES: ExpenseCategory[] = ['accommodation', 'transport', 'food', 'activities', 'shopping', 'other'];

export function rateFor(aggregate: TripAggregate, currency: string): number | null {
  if (currency === aggregate.trip.currency) return 1;
  return aggregate.rates.find((rate) => rate.currency === currency)?.rate ?? null;
}

export function convert(amount: number, rate: number | null): number | null {
  return rate === null ? null : Math.round(amount * rate * 100) / 100;
}

function activityCategory(activity: Activity): ExpenseCategory {
  if (activity.kind === 'transport') return 'transport';
  if (activity.category === 'food' || activity.category === 'nightlife') return 'food';
  if (activity.category === 'shopping') return 'shopping';
  return 'activities';
}

/** Cost of a stay attributed to each of its nights, used for the daily breakdown. */
function stayDayIds(aggregate: TripAggregate, stay: Stay): string[] {
  const start = aggregate.days.find((day) => day.id === stay.startDayId);
  if (!start) return [];
  return aggregate.days.filter((day) => day.number >= start.number && day.number < start.number + stay.nights).map((day) => day.id);
}

export function budgetSummary(aggregate: TripAggregate): BudgetSummary {
  const lines: BudgetLine[] = [];
  // An expense linked to an item records that item's actual cost and replaces its estimate.
  const superseded = new Set(aggregate.expenses.map((expense) => expense.activityId).filter((id): id is string => !!id));

  for (const activity of aggregate.activities) {
    if (activity.cost === null || activity.cost <= 0 || activity.bookingStatus === 'cancelled' || superseded.has(activity.id)) continue;
    lines.push({
      id: activity.id, source: activity.kind === 'transport' ? 'transport' : 'activity', title: activity.title,
      category: activityCategory(activity), amount: activity.cost, currency: activity.currency,
      converted: convert(activity.cost, rateFor(aggregate, activity.currency)), confirmed: activity.bookingStatus === 'booked', dayId: activity.dayId,
    });
  }
  for (const stay of aggregate.stays) {
    if (stay.cost === null || stay.cost <= 0 || stay.bookingStatus === 'cancelled' || superseded.has(stay.id)) continue;
    lines.push({
      id: stay.id, source: 'stay', title: stay.name, category: 'accommodation', amount: stay.cost, currency: stay.currency,
      converted: convert(stay.cost, rateFor(aggregate, stay.currency)), confirmed: stay.bookingStatus === 'booked', dayId: stay.startDayId,
    });
  }
  for (const expense of aggregate.expenses) {
    // An expense's own recorded rate wins over the trip rate table.
    const rate = expense.currency === aggregate.trip.currency ? 1 : expense.rate ?? rateFor(aggregate, expense.currency);
    lines.push({
      id: expense.id, source: 'expense', title: expense.title, category: expense.category, amount: expense.amount, currency: expense.currency,
      converted: convert(expense.amount, rate), confirmed: expense.status === 'paid', dayId: expense.dayId,
    });
  }

  const byCategory = Object.fromEntries(EXPENSE_CATEGORIES.map((category) => [category, { planned: 0, confirmed: 0 }])) as BudgetSummary['byCategory'];
  const byDay = new Map<string, number>();
  let planned = 0; let confirmed = 0; let unassigned = 0;
  const unconverted: BudgetLine[] = [];
  for (const line of lines) {
    if (line.converted === null) { unconverted.push(line); continue; }
    planned += line.converted;
    byCategory[line.category].planned += line.converted;
    if (line.confirmed) { confirmed += line.converted; byCategory[line.category].confirmed += line.converted; }
    const stay = line.source === 'stay' ? aggregate.stays.find((candidate) => candidate.id === line.id) : null;
    const dayIds = stay ? stayDayIds(aggregate, stay) : line.dayId ? [line.dayId] : [];
    if (!dayIds.length) unassigned += line.converted;
    for (const dayId of dayIds) byDay.set(dayId, (byDay.get(dayId) ?? 0) + line.converted / dayIds.length);
  }
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    currency: aggregate.trip.currency,
    lines,
    planned: round(planned),
    confirmed: round(confirmed),
    budget: aggregate.trip.budget,
    remaining: aggregate.trip.budget === null ? null : round(aggregate.trip.budget - planned),
    byCategory,
    byDay,
    unassigned: round(unassigned),
    unconverted,
    missingRates: [...new Set(unconverted.map((line) => line.currency))].sort(),
  };
}

export function formatMoney(amount: number | null | undefined, currency: string, options: { compact?: boolean } = {}): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency', currency, currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: options.compact || Math.abs(amount) >= 1000 || Number.isInteger(amount) ? 0 : 2,
      minimumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString('en')}`;
  }
}

/** The display name, prefixed with the 3-letter code when the symbol is ambiguous ("$"). */
export function formatMoneyWithCode(amount: number | null | undefined, currency: string): string {
  const formatted = formatMoney(amount, currency);
  return /^[-−]?[$¥£€]/.test(formatted) && !['EUR', 'GBP'].includes(currency) ? `${currency} ${formatted}` : formatted;
}
