import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';
import { type LocalDate } from '@/features/trips/domain/localDate';

import { type ExchangeRateInfo } from './ExchangeRate';
import { type Expense } from './Expense';

/** New conversion values for one expense (after the base currency or the rate changed). */
export interface ExpenseConversionUpdate {
  readonly id: string;
  readonly baseCurrency: string;
  readonly baseAmount: number | null;
  readonly exchangeRate: ExchangeRateInfo | null;
  readonly updatedAt: number;
  /**
   * The expense as it was read when converting. When given, the update applies only
   * while the stored expense still has these values; one edited (or converted into
   * another currency) since is left as it is, because its own save already converted it.
   */
  readonly basis?: Pick<Expense, 'amount' | 'currency' | 'date' | 'baseCurrency'>;
}

/**
 * Expenses saved on the device, kept separately per account like trips. Every
 * operation takes the owner and only sees that owner's expenses, and works offline.
 * Failures are `storage` errors; changes to a missing expense are `notFound`.
 * Deleting a trip deletes its expenses.
 */
export interface ExpenseRepository {
  /** The trip's expenses, by date, then `createdAt`. */
  listByTrip(ownerId: string, tripId: string): Promise<Result<readonly Expense[], AppError>>;
  findById(ownerId: string, id: string): Promise<Result<Expense | null, AppError>>;
  /** Fails if the trip doesn't exist. */
  insert(ownerId: string, expense: Expense): Promise<Result<void, AppError>>;
  /** Saves every editable field (not the id, trip or `createdAt`). */
  update(ownerId: string, expense: Expense): Promise<Result<void, AppError>>;
  /**
   * Writes all the updates in one transaction; `notFound`, changing nothing, if any expense is missing.
   * An update whose `basis` no longer matches the stored expense is skipped.
   */
  updateConversions(ownerId: string, updates: readonly ExpenseConversionUpdate[]): Promise<Result<void, AppError>>;
  delete(ownerId: string, id: string): Promise<Result<void, AppError>>;
}

/** Exchange rates (public data, shared by every account). */
export interface ExchangeRateRepository {
  /**
   * `1 from = rate to` on `date` (the latest rate for today or a future date).
   * `badRequest` for a currency the source doesn't support.
   */
  getRate(from: string, to: string, date: LocalDate, signal?: AbortSignal): Promise<Result<ExchangeRateInfo, AppError>>;
  /** ISO codes the source can convert, sorted. */
  supportedCurrencies(signal?: AbortSignal): Promise<Result<readonly string[], AppError>>;
}
