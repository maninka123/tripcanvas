'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export const BASE_CURRENCY = 'AUD';

// flagCode is the ISO 3166-1 alpha-2 territory code used to fetch a small flag
// icon from flagcdn.com — emoji flags render as bare two-letter codes on some
// platforms (notably Windows), so a real icon image is used instead.
export const CURRENCY_INFO: Record<string, { symbol: string; flagCode: string; name: string }> = {
  AUD: { symbol: 'A$', flagCode: 'au', name: 'Australian Dollar' },
  USD: { symbol: '$', flagCode: 'us', name: 'US Dollar' },
  LKR: { symbol: 'Rs', flagCode: 'lk', name: 'Sri Lankan Rupee' },
  CNY: { symbol: '¥', flagCode: 'cn', name: 'Chinese Yuan' },
  JPY: { symbol: '¥', flagCode: 'jp', name: 'Japanese Yen' },
  EUR: { symbol: '€', flagCode: 'eu', name: 'Euro' },
  GBP: { symbol: '£', flagCode: 'gb', name: 'British Pound' },
  NZD: { symbol: 'NZ$', flagCode: 'nz', name: 'New Zealand Dollar' },
  THB: { symbol: '฿', flagCode: 'th', name: 'Thai Baht' },
  IDR: { symbol: 'Rp', flagCode: 'id', name: 'Indonesian Rupiah' },
  SGD: { symbol: 'S$', flagCode: 'sg', name: 'Singapore Dollar' },
  INR: { symbol: '₹', flagCode: 'in', name: 'Indian Rupee' },
  KRW: { symbol: '₩', flagCode: 'kr', name: 'South Korean Won' },
  VND: { symbol: '₫', flagCode: 'vn', name: 'Vietnamese Dong' },
  MYR: { symbol: 'RM', flagCode: 'my', name: 'Malaysian Ringgit' },
  PHP: { symbol: '₱', flagCode: 'ph', name: 'Philippine Peso' },
  HKD: { symbol: 'HK$', flagCode: 'hk', name: 'Hong Kong Dollar' },
  FJD: { symbol: 'FJ$', flagCode: 'fj', name: 'Fijian Dollar' },
  AED: { symbol: 'AED', flagCode: 'ae', name: 'UAE Dirham' },
  CHF: { symbol: 'Fr', flagCode: 'ch', name: 'Swiss Franc' },
  CAD: { symbol: 'C$', flagCode: 'ca', name: 'Canadian Dollar' },
};

export function flagIconUrl(flagCode: string): string {
  return `https://flagcdn.com/24x18/${flagCode}.png`;
}

const COUNTRY_CURRENCY: Record<string, string> = {
  japan: 'JPY', 'united states': 'USD', usa: 'USD', 'sri lanka': 'LKR', china: 'CNY',
  'united kingdom': 'GBP', uk: 'GBP', france: 'EUR', germany: 'EUR', italy: 'EUR', spain: 'EUR',
  portugal: 'EUR', netherlands: 'EUR', greece: 'EUR', austria: 'EUR', ireland: 'EUR',
  'new zealand': 'NZD', thailand: 'THB', indonesia: 'IDR', singapore: 'SGD', india: 'INR',
  'south korea': 'KRW', korea: 'KRW', vietnam: 'VND', malaysia: 'MYR', philippines: 'PHP',
  'hong kong': 'HKD', fiji: 'FJD', australia: 'AUD', 'united arab emirates': 'AED',
  switzerland: 'CHF', canada: 'CAD',
};

export function currencyCodeForCountry(country?: string | null): string | null {
  if (!country) return null;
  return COUNTRY_CURRENCY[country.trim().toLowerCase()] ?? null;
}

export const CURRENCY_OPTIONS = ['AUD', 'USD', 'LKR', 'CNY'] as const;

type RatesCache = { date: string; base: string; rates: Record<string, number> };

type CurrencyContextValue = {
  selection: string;
  setSelection: (code: string) => void;
  currency: string;
  localCountry: string | null;
  setLocalCountry: (country: string | null) => void;
  loading: boolean;
  ratesDate: string | null;
  info: (code: string) => { symbol: string; flagCode: string; name: string };
  convert: (amountInBase: number) => number;
  format: (amountInBase: number) => string;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

const SELECTION_KEY = 'roamly.currency.selection';
const RATES_KEY = 'roamly.currency.rates';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadCachedRates(): RatesCache | null {
  try {
    const raw = localStorage.getItem(RATES_KEY);
    if (!raw) return null;
    const parsed: RatesCache = JSON.parse(raw);
    return parsed.date === todayKey() && parsed.base === BASE_CURRENCY ? parsed : null;
  } catch {
    return null;
  }
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [selection, setSelectionState] = useState<string>(BASE_CURRENCY);
  const [localCountry, setLocalCountry] = useState<string | null>(null);
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [ratesDate, setRatesDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Reads persisted selection/rates from localStorage and fetches today's rates once on mount —
  // both are external-system reads that belong in an effect.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SELECTION_KEY);
      if (saved) setSelectionState(saved);
    } catch { /* localStorage unavailable */ }
    const cached = loadCachedRates();
    if (cached) { setRates(cached.rates); setRatesDate(cached.date); return; }
    setLoading(true);
    fetch(`https://open.er-api.com/v6/latest/${BASE_CURRENCY}`)
      .then((res) => res.json() as Promise<{ rates?: Record<string, number> }>)
      .then((data) => {
        if (!data?.rates) return;
        setRates(data.rates);
        setRatesDate(todayKey());
        try { localStorage.setItem(RATES_KEY, JSON.stringify({ date: todayKey(), base: BASE_CURRENCY, rates: data.rates })); } catch { /* localStorage unavailable */ }
      })
      .catch(() => { /* keep base-currency amounts if the rate lookup fails */ })
      .finally(() => setLoading(false));
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setSelection = useCallback((code: string) => {
    setSelectionState(code);
    try { localStorage.setItem(SELECTION_KEY, code); } catch { /* localStorage unavailable */ }
  }, []);

  const currency = selection === 'LOCAL' ? (currencyCodeForCountry(localCountry) ?? BASE_CURRENCY) : selection;

  const info = useCallback((code: string) => CURRENCY_INFO[code] ?? { symbol: `${code} `, flagCode: 'xx', name: code }, []);

  const convert = useCallback((amountInBase: number) => {
    if (currency === BASE_CURRENCY || !rates?.[currency]) return amountInBase;
    return amountInBase * rates[currency];
  }, [currency, rates]);

  const format = useCallback((amountInBase: number) => `${info(currency).symbol}${Math.round(convert(amountInBase)).toLocaleString()}`, [convert, currency, info]);

  const value = useMemo<CurrencyContextValue>(() => ({
    selection, setSelection, currency, localCountry, setLocalCountry, loading, ratesDate, info, convert, format,
  }), [selection, setSelection, currency, localCountry, loading, ratesDate, info, convert, format]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within a CurrencyProvider');
  return ctx;
}
