import { z } from 'zod';

import { type SqlDatabase, type SqlValue } from '@/core/database/SqlDatabase';
import { AppError } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { err, ok, type Result } from '@/core/result';
import { isLocalDate } from '@/features/trips/domain/localDate';
import { isCurrencyCode } from '@/features/trips/domain/money';

import { RATE_SOURCES } from '../domain/ExchangeRate';
import { EXPENSE_CATEGORIES, type Expense, PAYMENT_METHODS } from '../domain/Expense';
import { type ExpenseConversionUpdate, type ExpenseRepository } from '../domain/repositories';

const COLUMNS = `id, trip_id, title, amount_minor, currency, base_currency, base_amount_minor, exchange_rate,
  rate_date, rate_source, category, date, payment_method, notes, created_at, updated_at`;

const localDate = z.string().refine(isLocalDate);
const decimalRate = z.string().regex(/^\d+(\.\d+)?$/);

/** Storage is untrusted input too: a row that doesn't describe a valid expense is skipped, not shown half-broken. */
const expenseRowSchema = z
  .object({
    id: z.string().min(1),
    trip_id: z.string().min(1),
    title: z.string().min(1),
    amount_minor: z.number().int().positive(),
    currency: z.string().refine(isCurrencyCode),
    base_currency: z.string().refine(isCurrencyCode),
    base_amount_minor: z.number().int().nonnegative().nullable(),
    exchange_rate: decimalRate.nullable(),
    rate_date: localDate.nullable(),
    rate_source: z.enum(RATE_SOURCES).nullable(),
    category: z.enum(EXPENSE_CATEGORIES),
    date: localDate,
    payment_method: z.enum(PAYMENT_METHODS),
    notes: z.string(),
    created_at: z.number(),
    updated_at: z.number(),
  })
  .refine(
    (row) =>
      (row.base_amount_minor === null) === (row.exchange_rate === null) &&
      (row.exchange_rate === null) === (row.rate_date === null) &&
      (row.exchange_rate === null) === (row.rate_source === null),
  );

type ExpenseRow = z.infer<typeof expenseRowSchema>;

function toExpense(row: ExpenseRow): Expense {
  const rate =
    row.exchange_rate !== null && row.rate_date !== null && row.rate_source !== null
      ? { rate: row.exchange_rate, rateDate: row.rate_date, source: row.rate_source }
      : null;
  return {
    id: row.id,
    tripId: row.trip_id,
    title: row.title,
    amount: row.amount_minor,
    currency: row.currency,
    baseCurrency: row.base_currency,
    baseAmount: rate === null ? null : row.base_amount_minor,
    exchangeRate: rate,
    category: row.category,
    date: row.date,
    paymentMethod: row.payment_method,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** `base_currency, base_amount_minor, exchange_rate, rate_date, rate_source`, in that order. */
function conversionValues(conversion: Pick<Expense, 'baseCurrency' | 'baseAmount' | 'exchangeRate'>): SqlValue[] {
  return [
    conversion.baseCurrency,
    conversion.baseAmount,
    conversion.exchangeRate?.rate ?? null,
    conversion.exchangeRate?.rateDate ?? null,
    conversion.exchangeRate?.source ?? null,
  ];
}

/** Columns shared by INSERT (after `id, trip_id`) and UPDATE, in `COLUMNS` order. */
function editableValues(expense: Expense): SqlValue[] {
  return [
    expense.title,
    expense.amount,
    expense.currency,
    ...conversionValues(expense),
    expense.category,
    expense.date,
    expense.paymentMethod,
    expense.notes,
  ];
}

/**
 * Expenses in the on-device SQLite database. No network is involved in any operation.
 * Every statement is limited to `owner_id`, so one account can't read or change another's expenses.
 */
export class LocalExpenseRepository implements ExpenseRepository {
  constructor(
    private readonly database: SqlDatabase,
    private readonly logger: Logger,
  ) {}

  listByTrip(ownerId: string, tripId: string): Promise<Result<readonly Expense[], AppError>> {
    return this.attempt('load the expenses', async () =>
      this.parseRows(
        await this.database.getAll(
          `SELECT ${COLUMNS} FROM expenses WHERE owner_id = ? AND trip_id = ? ORDER BY date, created_at, id`,
          [ownerId, tripId],
        ),
      ),
    );
  }

  findById(ownerId: string, id: string): Promise<Result<Expense | null, AppError>> {
    return this.attempt('load the expense', async () => {
      const row = await this.database.getFirst(`SELECT ${COLUMNS} FROM expenses WHERE id = ? AND owner_id = ?`, [
        id,
        ownerId,
      ]);
      return row === null ? null : (this.parseRows([row])[0] ?? null);
    });
  }

  insert(ownerId: string, expense: Expense): Promise<Result<void, AppError>> {
    return this.attempt('save the expense', async () => {
      await this.database.run(
        `INSERT INTO expenses (owner_id, ${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ownerId, expense.id, expense.tripId, ...editableValues(expense), expense.createdAt, expense.updatedAt],
      );
    });
  }

  async update(ownerId: string, expense: Expense): Promise<Result<void, AppError>> {
    const updated = await this.attempt('update the expense', async () => {
      const { changes } = await this.database.run(
        `UPDATE expenses SET title = ?, amount_minor = ?, currency = ?, base_currency = ?, base_amount_minor = ?,
           exchange_rate = ?, rate_date = ?, rate_source = ?, category = ?, date = ?, payment_method = ?, notes = ?,
           updated_at = ?
         WHERE id = ? AND owner_id = ?`,
        [...editableValues(expense), expense.updatedAt, expense.id, ownerId],
      );
      return changes > 0;
    });
    return this.requireFound(updated, expense.id);
  }

  async updateConversions(
    ownerId: string,
    updates: readonly ExpenseConversionUpdate[],
  ): Promise<Result<void, AppError>> {
    if (updates.length === 0) return ok(undefined);
    const updated = await this.attempt('save the converted amounts', () =>
      this.database.transaction(async (tx) => {
        for (const update of updates) {
          const found = await tx.getFirst('SELECT id FROM expenses WHERE id = ? AND owner_id = ?', [
            update.id,
            ownerId,
          ]);
          if (found === null) return false;
        }
        for (const update of updates) {
          const { basis } = update;
          // Converted from what was read: an expense edited since then keeps what its own save wrote.
          const unchangedSince = basis
            ? ' AND amount_minor = ? AND currency = ? AND date = ? AND base_currency = ?'
            : '';
          const basisValues: SqlValue[] = basis ? [basis.amount, basis.currency, basis.date, basis.baseCurrency] : [];
          await tx.run(
            `UPDATE expenses SET base_currency = ?, base_amount_minor = ?, exchange_rate = ?, rate_date = ?,
               rate_source = ?, updated_at = ?
             WHERE id = ? AND owner_id = ?${unchangedSince}`,
            [...conversionValues(update), update.updatedAt, update.id, ownerId, ...basisValues],
          );
        }
        return true;
      }),
    );
    return this.requireFound(updated, updates.map(({ id }) => id).join(', '));
  }

  async delete(ownerId: string, id: string): Promise<Result<void, AppError>> {
    const deleted = await this.attempt('delete the expense', async () => {
      const { changes } = await this.database.run('DELETE FROM expenses WHERE id = ? AND owner_id = ?', [id, ownerId]);
      return changes > 0;
    });
    return this.requireFound(deleted, id);
  }

  private requireFound(result: Result<boolean, AppError>, id: string): Result<void, AppError> {
    if (!result.ok) return result;
    return result.value ? ok(undefined) : err(new AppError('notFound', `Expense ${id} not found`));
  }

  private parseRows(rows: readonly unknown[]): Expense[] {
    const expenses: Expense[] = [];
    for (const row of rows) {
      const parsed = expenseRowSchema.safeParse(row);
      if (parsed.success) expenses.push(toExpense(parsed.data));
    }
    if (expenses.length < rows.length) {
      this.logger.warn('Skipped unreadable expenses', { skipped: rows.length - expenses.length });
    }
    return expenses;
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
