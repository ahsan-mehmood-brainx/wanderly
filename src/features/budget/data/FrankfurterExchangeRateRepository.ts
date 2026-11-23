import { AppError } from '@/core/errors/AppError';
import { type HttpClient } from '@/core/http';
import { err, ok, type Result } from '@/core/result';
import { type Clock } from '@/core/utils/Clock';
import { compareLocalDates, type LocalDate, localDateAt } from '@/features/trips/domain/localDate';

import { parseDecimalRate } from '../domain/budgetCalculations';
import { type ExchangeRateInfo } from '../domain/ExchangeRate';
import { type ExchangeRateRepository } from '../domain/repositories';
import { currenciesDtoSchema, ratesDtoSchema } from './dto/frankfurterDtos';
import { CURRENCIES_PATH, historicalPath, LATEST_PATH } from './frankfurterApi';

/** Digits kept when the API prints a rate in exponent form (`1e-7`); far beyond what ECB publishes. */
const EXPONENT_RATE_DIGITS = 12;

/**
 * The rate as the decimal the API printed. `String` gives the shortest text that
 * round-trips, which is exactly what was in the JSON for any normal rate.
 */
function rateText(rate: number): string | null {
  const text = String(rate);
  return parseDecimalRate(/e/i.test(text) ? rate.toFixed(EXPONENT_RATE_DIGITS) : text);
}

/**
 * Rates from Frankfurter: `/latest` for today or a future date, `/{date}` for a past
 * one. The rate date is the one the API returns (the previous working day on weekends).
 */
export class FrankfurterExchangeRateRepository implements ExchangeRateRepository {
  constructor(
    private readonly http: HttpClient,
    private readonly clock: Clock,
  ) {}

  async getRate(
    from: string,
    to: string,
    date: LocalDate,
    signal?: AbortSignal,
  ): Promise<Result<ExchangeRateInfo, AppError>> {
    const today = localDateAt(this.clock.now());
    const path = compareLocalDates(date, today) >= 0 ? LATEST_PATH : historicalPath(date);
    const response = await this.http.get(path, {
      query: { base: from, symbols: to },
      schema: ratesDtoSchema,
      signal,
    });
    if (!response.ok) return err(response.error);

    const { rates, date: rateDate } = response.value.data;
    const value = rates[to];
    if (value === undefined) return err(new AppError('badRequest', `No ${from} to ${to} rate is published`));
    const rate = rateText(value);
    if (rate === null) return err(new AppError('parse', `Unreadable ${from} to ${to} rate`));
    return ok({ rate, rateDate, source: 'api' });
  }

  async supportedCurrencies(signal?: AbortSignal): Promise<Result<readonly string[], AppError>> {
    const response = await this.http.get(CURRENCIES_PATH, { schema: currenciesDtoSchema, signal });
    if (!response.ok) return err(response.error);
    return ok(Object.keys(response.value.data).sort());
  }
}
