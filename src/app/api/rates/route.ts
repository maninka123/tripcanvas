import { z } from 'zod';
import { latestRates, toTripRate } from '@/services/exchange-rates';
import { authContext } from '@/server/context';
import { ApiError, badRequest, json, route } from '@/server/http';

const querySchema = z.object({ base: z.string().regex(/^[A-Z]{3}$/), currencies: z.string().regex(/^[A-Z]{3}(,[A-Z]{3})*$/) });

/** Reference rates to convert each listed currency into `base`, with source and timestamp. */
export const GET = route('rates.get', async (request, { requestId }) => {
  await authContext();
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) throw badRequest('Provide base and currencies as 3-letter codes.');
  let table;
  try {
    table = await latestRates(parsed.data.base);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'provider_error', 'Exchange rates are unavailable right now. You can enter a rate manually.');
  }
  const rates = Object.fromEntries(parsed.data.currencies.split(',').map((currency) => [currency, toTripRate(table, currency)]));
  return json({ base: table.base, rates, at: table.at, source: table.source, attributionUrl: table.attributionUrl }, { requestId });
});
