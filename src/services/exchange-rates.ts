import { fetchProviderJson } from './provider-fetch';

// Reference exchange rates from ExchangeRate-API's open endpoint (daily,
// attribution required). Rates are suggestions: the trip records the rate
// actually applied, with its timestamp and source, and the user can override.

export type RateTable = { base: string; rates: Record<string, number>; at: string; source: string; attributionUrl: string };

type OpenErApi = { result?: string; base_code?: string; time_last_update_utc?: string; rates?: Record<string, number> };

export async function latestRates(base: string): Promise<RateTable> {
  const data = await fetchProviderJson<OpenErApi>('ExchangeRate-API', `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`, { ttlSeconds: 6 * 3600 });
  if (data.result !== 'success' || !data.rates) throw new Error('Exchange rates are unavailable.');
  return {
    base,
    rates: data.rates,
    at: data.time_last_update_utc ? new Date(data.time_last_update_utc).toISOString() : new Date().toISOString(),
    source: 'ExchangeRate-API',
    attributionUrl: 'https://www.exchangerate-api.com',
  };
}

/**
 * The provider quotes 1 base = N foreign. A trip rate converts foreign into
 * the trip currency, so it is the reciprocal.
 */
export function toTripRate(table: RateTable, currency: string): number | null {
  const quoted = table.rates[currency];
  if (!quoted || quoted <= 0) return null;
  return Math.round((1 / quoted) * 1_000_000) / 1_000_000;
}
