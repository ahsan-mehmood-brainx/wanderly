import { type LocalDate } from '@/features/trips/domain/localDate';

/**
 * Where an expense's exchange rate came from:
 * - `identity`: the expense is in the base currency (rate `1`, no request).
 * - `api`: Frankfurter answered for this date (or the API's nearest working day).
 * - `fallback`: the API was unavailable; the nearest earlier cached rate was used (approximate).
 * - `manual`: typed by the traveller because no rate was available.
 */
export const RATE_SOURCES = ['identity', 'api', 'fallback', 'manual'] as const;
export type RateSource = (typeof RATE_SOURCES)[number];

/** The rate an amount was converted with: `1 FROM = rate TO`. */
export interface ExchangeRateInfo {
  /** A positive decimal string (`'1.0805'`), never a float, so conversions stay exact. */
  readonly rate: string;
  /** The date the rate is for, as the source reported it (may differ from the expense date). */
  readonly rateDate: LocalDate;
  readonly source: RateSource;
}
