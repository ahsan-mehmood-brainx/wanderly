import { z } from 'zod';

import { type SqlDatabase } from '@/core/database/SqlDatabase';
import { AppError } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { err, ok, type Result } from '@/core/result';
import { isLocalDate, type LocalDate } from '@/features/trips/domain/localDate';
import { isCurrencyCode } from '@/features/trips/domain/money';

/** The key used for the latest rate (today or a future date). */
export const LATEST_RATE = 'latest';

export interface CachedRate {
  readonly base: string;
  readonly quote: string;
  /** The date asked for, or {@link LATEST_RATE}. */
  readonly requestedDate: LocalDate | typeof LATEST_RATE;
  /** Decimal string. */
  readonly rate: string;
  /** The date the source said the rate is for. */
  readonly rateDate: LocalDate;
  /** Epoch ms. */
  readonly fetchedAt: number;
}

const COLUMNS = 'base, quote, requested_date, rate, rate_date, fetched_at';

const rateRowSchema = z.object({
  base: z.string().refine(isCurrencyCode),
  quote: z.string().refine(isCurrencyCode),
  requested_date: z.union([z.literal(LATEST_RATE), z.string().refine(isLocalDate)]),
  rate: z.string().regex(/^\d+(\.\d+)?$/),
  rate_date: z.string().refine(isLocalDate),
  fetched_at: z.number(),
});

/** Exchange rates kept in SQLite (`exchange_rates`), shared by every account because they are public data. */
export class LocalExchangeRateCache {
  constructor(
    private readonly database: SqlDatabase,
    private readonly logger: Logger,
  ) {}

  get(
    base: string,
    quote: string,
    requestedDate: LocalDate | typeof LATEST_RATE,
  ): Promise<Result<CachedRate | null, AppError>> {
    return this.attempt('read the exchange rate', async () =>
      this.parse(
        await this.database.getFirst(
          `SELECT ${COLUMNS} FROM exchange_rates WHERE base = ? AND quote = ? AND requested_date = ?`,
          [base, quote, requestedDate],
        ),
      ),
    );
  }

  /** The cached rate for the pair with the latest `rateDate` on or before `date`. */
  nearestBefore(base: string, quote: string, date: LocalDate): Promise<Result<CachedRate | null, AppError>> {
    return this.attempt('read the exchange rate', async () =>
      this.parse(
        await this.database.getFirst(
          `SELECT ${COLUMNS} FROM exchange_rates WHERE base = ? AND quote = ? AND rate_date <= ?
           ORDER BY rate_date DESC, fetched_at DESC LIMIT 1`,
          [base, quote, date],
        ),
      ),
    );
  }

  save(rate: CachedRate): Promise<Result<void, AppError>> {
    return this.attempt('save the exchange rate', async () => {
      await this.database.run(`INSERT OR REPLACE INTO exchange_rates (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`, [
        rate.base,
        rate.quote,
        rate.requestedDate,
        rate.rate,
        rate.rateDate,
        rate.fetchedAt,
      ]);
    });
  }

  private parse(row: unknown): CachedRate | null {
    if (row === null) return null;
    const parsed = rateRowSchema.safeParse(row);
    if (!parsed.success) {
      this.logger.warn('Skipped an unreadable exchange rate');
      return null;
    }
    const { data } = parsed;
    return {
      base: data.base,
      quote: data.quote,
      requestedDate: data.requested_date,
      rate: data.rate,
      rateDate: data.rate_date,
      fetchedAt: data.fetched_at,
    };
  }

  private async attempt<T>(action: string, work: () => Promise<T>): Promise<Result<T, AppError>> {
    try {
      return ok(await work());
    } catch (cause) {
      this.logger.error(`Could not ${action}`, { cause });
      return err(new AppError('storage', `Could not ${action}`, { cause }));
    }
  }
}
