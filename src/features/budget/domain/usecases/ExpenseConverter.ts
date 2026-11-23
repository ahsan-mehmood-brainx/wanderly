import { type LocalDate } from '@/features/trips/domain/localDate';

import { convertMinor } from '../budgetCalculations';
import { type ExchangeRateInfo } from '../ExchangeRate';
import { type ExchangeRateRepository } from '../repositories';

export interface ConversionRequest {
  /** Minor units of `currency`. */
  readonly amount: number;
  readonly currency: string;
  readonly baseCurrency: string;
  readonly date: LocalDate;
  /** Used only when no rate is available. */
  readonly manualRate: string | null;
  readonly signal?: AbortSignal;
}

export interface Conversion {
  readonly baseAmount: number | null;
  readonly exchangeRate: ExchangeRateInfo | null;
}

export const UNCONVERTED: Conversion = { baseAmount: null, exchangeRate: null };

/** The conversion at `info`, or `null` if the rate can't be applied. */
function applyRate(request: ConversionRequest, info: ExchangeRateInfo): Conversion | null {
  try {
    return {
      baseAmount: convertMinor(request.amount, request.currency, request.baseCurrency, info.rate),
      exchangeRate: info,
    };
  } catch {
    return null;
  }
}

/**
 * True when the rate API is known not to publish one of the two currencies, so a
 * lookup would always fail. An unknown list (lookup failed) never blocks a lookup.
 */
export async function isUnsupportedPair(
  rates: ExchangeRateRepository,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const supported = await rates.supportedCurrencies(signal);
  if (!supported.ok || supported.value.length === 0) return false;
  return !supported.value.includes(from) || !supported.value.includes(to);
}

/**
 * Converts an expense into the base currency: identity for the same currency,
 * then the rate repository (skipped when the API doesn't publish the currency),
 * then a manual rate, otherwise unconverted. Never fails.
 */
export class ExpenseConverter {
  constructor(private readonly rates: ExchangeRateRepository) {}

  /** The conversion at a rate already looked up (no network), or unconverted if it can't be applied. */
  convertAt(request: ConversionRequest, info: ExchangeRateInfo): Conversion {
    return applyRate(request, info) ?? UNCONVERTED;
  }

  async convert(request: ConversionRequest): Promise<Conversion> {
    const { currency, baseCurrency, date } = request;
    if (currency === baseCurrency) {
      return { baseAmount: request.amount, exchangeRate: { rate: '1', rateDate: date, source: 'identity' } };
    }

    if (!(await isUnsupportedPair(this.rates, currency, baseCurrency, request.signal))) {
      const rate = await this.rates.getRate(currency, baseCurrency, date, request.signal);
      if (rate.ok) {
        const converted = applyRate(request, rate.value);
        if (converted) return converted;
      }
    }

    if (request.manualRate !== null) {
      const converted = applyRate(request, { rate: request.manualRate, rateDate: date, source: 'manual' });
      if (converted) return converted;
    }
    return UNCONVERTED;
  }
}
