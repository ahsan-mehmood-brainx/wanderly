import { z } from 'zod';

import { type AppError } from '@/core/errors/AppError';
import { ok, type Result } from '@/core/result';
import { type KeyValueStore } from '@/core/storage/KeyValueStore';
import { type Clock } from '@/core/utils/Clock';
import { addDays, compareLocalDates, type LocalDate, localDateAt } from '@/features/trips/domain/localDate';

import { type ExchangeRateInfo } from '../domain/ExchangeRate';
import { type ExchangeRateRepository } from '../domain/repositories';
import { LATEST_RATE, type LocalExchangeRateCache } from './LocalExchangeRateCache';

/**
 * How long the latest rate is reused before asking again. Also applies to a recent
 * historical answer that may still change (see {@link SETTLED_AFTER_DAYS}).
 */
export const LATEST_RATE_TTL_MS = 6 * 60 * 60_000;

/**
 * Days before the device's today after which a date's rate is final everywhere. The ECB
 * publishes a day's rate in the afternoon CET; at UTC+14 a local day starts ~10 hours
 * ahead of CET, so local "yesterday" may not be published yet, but two days back always is.
 */
export const SETTLED_AFTER_DAYS = 2;

/** How long the supported currency list is reused. */
export const CURRENCIES_TTL_MS = 7 * 24 * 60 * 60_000;

export const CURRENCIES_STORAGE_KEY = 'budget.currencies.v1';

const savedCurrenciesSchema = z.object({
  fetchedAt: z.number(),
  codes: z.array(z.string().regex(/^[A-Z]{3}$/)),
});

type SavedCurrencies = z.infer<typeof savedCurrenciesSchema>;

/**
 * Rates through the SQLite cache: an exact cached rate first, then the API (saving
 * what it returns), then, when the API fails, the nearest earlier cached rate
 * (source `fallback`). Failures are never cached.
 */
export class CachedExchangeRateRepository implements ExchangeRateRepository {
  constructor(
    private readonly remote: ExchangeRateRepository,
    private readonly cache: LocalExchangeRateCache,
    private readonly clock: Clock,
    private readonly store: KeyValueStore,
  ) {}

  async getRate(
    from: string,
    to: string,
    date: LocalDate,
    signal?: AbortSignal,
  ): Promise<Result<ExchangeRateInfo, AppError>> {
    const now = this.clock.now();
    const today = localDateAt(now);
    const requestedDate = compareLocalDates(date, today) >= 0 ? LATEST_RATE : date;

    // A cache that can't be read is a miss: the API (or the fallback) still answers.
    const cached = await this.cache.get(from, to, requestedDate);
    if (cached.ok && cached.value) {
      // A fetch time ahead of now (the clock was set back) can't be trusted to be recent.
      const age = now - cached.value.fetchedAt;
      // A historical answer is final once it is for the date itself or the date is settled.
      // Otherwise (an earlier day, e.g. the date's rate wasn't published yet) it may still change.
      const final =
        requestedDate !== LATEST_RATE &&
        (cached.value.rateDate === date || compareLocalDates(date, addDays(today, -SETTLED_AFTER_DAYS)) <= 0);
      const fresh = final || (age >= 0 && age < LATEST_RATE_TTL_MS);
      if (fresh) return ok({ rate: cached.value.rate, rateDate: cached.value.rateDate, source: 'api' });
    }

    const fetched = await this.remote.getRate(from, to, date, signal);
    if (fetched.ok) {
      await this.cache.save({
        base: from,
        quote: to,
        requestedDate,
        rate: fetched.value.rate,
        rateDate: fetched.value.rateDate,
        fetchedAt: now,
      });
      return fetched;
    }
    if (fetched.error.kind === 'cancelled') return fetched;

    const nearest = await this.cache.nearestBefore(from, to, date);
    if (nearest.ok && nearest.value) {
      return ok({ rate: nearest.value.rate, rateDate: nearest.value.rateDate, source: 'fallback' });
    }
    return fetched;
  }

  async supportedCurrencies(signal?: AbortSignal): Promise<Result<readonly string[], AppError>> {
    const saved = await this.readCurrencies();
    const now = this.clock.now();
    if (saved && now - saved.fetchedAt < CURRENCIES_TTL_MS) return ok(saved.codes);

    const fetched = await this.remote.supportedCurrencies(signal);
    if (!fetched.ok) return saved ? ok(saved.codes) : fetched;
    await this.writeCurrencies({ fetchedAt: now, codes: [...fetched.value] });
    return fetched;
  }

  private async readCurrencies(): Promise<SavedCurrencies | null> {
    try {
      const raw = await this.store.getItem(CURRENCIES_STORAGE_KEY);
      if (!raw) return null;
      const parsed = savedCurrenciesSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private async writeCurrencies(value: SavedCurrencies): Promise<void> {
    try {
      await this.store.setItem(CURRENCIES_STORAGE_KEY, JSON.stringify(value));
    } catch {
      // The list is fetched again next time; nothing depends on it being saved.
    }
  }
}
