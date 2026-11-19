import { z } from 'zod';

import { type SqlDatabase, type SqlValue } from '@/core/database/SqlDatabase';
import { AppError } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { err, ok, type Result } from '@/core/result';

import { isLocalDate, type LocalDate } from '../domain/localDate';
import { isCurrencyCode } from '../domain/money';
import { type TripRepository } from '../domain/repositories';
import { type StoredTrip } from '../domain/Trip';

const COLUMNS = `id, title, destination_id, destination_name, start_date, end_date, description,
  cover_image, budget_minor, currency, cancelled_at, created_at, updated_at`;

const localDate = z.string().refine(isLocalDate);

/** Storage is untrusted input too: a row that doesn't describe a valid trip is skipped, not shown half-broken. */
const tripRowSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    destination_id: z.string().min(1),
    destination_name: z.string().min(1),
    start_date: localDate,
    end_date: localDate,
    description: z.string(),
    cover_image: z.string().nullable(),
    budget_minor: z.number().int().positive(),
    currency: z.string().refine(isCurrencyCode),
    cancelled_at: z.number().nullable(),
    created_at: z.number(),
    updated_at: z.number(),
  })
  .refine((row) => row.end_date >= row.start_date);

function toTrip(row: z.infer<typeof tripRowSchema>): StoredTrip {
  return {
    id: row.id,
    title: row.title,
    destinationId: row.destination_id,
    destinationName: row.destination_name,
    startDate: row.start_date,
    endDate: row.end_date,
    description: row.description,
    coverImage: row.cover_image,
    budget: row.budget_minor,
    currency: row.currency,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Trips in the on-device SQLite database. No network is involved in any operation.
 * Every statement is limited to `owner_id`, so one account can't read or change another's trips.
 */
export class LocalTripRepository implements TripRepository {
  constructor(
    private readonly database: SqlDatabase,
    private readonly logger: Logger,
  ) {}

  list(ownerId: string): Promise<Result<readonly StoredTrip[], AppError>> {
    return this.attempt('load trips', async () =>
      this.parseRows(
        await this.database.getAll(
          `SELECT ${COLUMNS} FROM trips WHERE owner_id = ? ORDER BY start_date, end_date, id`,
          [ownerId],
        ),
      ),
    );
  }

  findById(ownerId: string, id: string): Promise<Result<StoredTrip | null, AppError>> {
    return this.attempt('load the trip', async () => {
      const row = await this.database.getFirst(`SELECT ${COLUMNS} FROM trips WHERE id = ? AND owner_id = ?`, [
        id,
        ownerId,
      ]);
      return row === null ? null : (this.parseRows([row])[0] ?? null);
    });
  }

  findOverlapping(
    ownerId: string,
    range: { readonly startDate: LocalDate; readonly endDate: LocalDate },
    excludeId: string | null,
  ): Promise<Result<readonly StoredTrip[], AppError>> {
    // The same comparison as `tripsOverlap`, done here so it uses the index and sees every saved trip.
    return this.attempt('check trip dates', async () =>
      this.parseRows(
        await this.database.getAll(
          `SELECT ${COLUMNS} FROM trips
           WHERE owner_id = ? AND cancelled_at IS NULL AND start_date < ? AND end_date > ?
             AND (? IS NULL OR id <> ?)
           ORDER BY start_date, end_date, id`,
          [ownerId, range.endDate, range.startDate, excludeId, excludeId],
        ),
      ),
    );
  }

  insert(ownerId: string, trip: StoredTrip): Promise<Result<void, AppError>> {
    return this.attempt('save the trip', async () => {
      await this.database.run(
        `INSERT INTO trips (owner_id, ${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ownerId, trip.id, ...editableValues(trip), trip.createdAt, trip.updatedAt],
      );
    });
  }

  async update(ownerId: string, trip: StoredTrip): Promise<Result<void, AppError>> {
    const updated = await this.attempt('update the trip', () =>
      this.database.run(
        `UPDATE trips SET title = ?, destination_id = ?, destination_name = ?, start_date = ?, end_date = ?,
           description = ?, cover_image = ?, budget_minor = ?, currency = ?, cancelled_at = ?, updated_at = ?
         WHERE id = ? AND owner_id = ?`,
        [...editableValues(trip), trip.updatedAt, trip.id, ownerId],
      ),
    );
    return this.requireChange(updated, trip.id);
  }

  async delete(ownerId: string, id: string): Promise<Result<void, AppError>> {
    const deleted = await this.attempt('delete the trip', () =>
      this.database.run('DELETE FROM trips WHERE id = ? AND owner_id = ?', [id, ownerId]),
    );
    return this.requireChange(deleted, id);
  }

  private requireChange(result: Result<{ readonly changes: number }, AppError>, id: string): Result<void, AppError> {
    if (!result.ok) return result;
    return result.value.changes > 0 ? ok(undefined) : err(new AppError('notFound', `Trip ${id} not found`));
  }

  private parseRows(rows: readonly unknown[]): StoredTrip[] {
    const trips: StoredTrip[] = [];
    for (const row of rows) {
      const parsed = tripRowSchema.safeParse(row);
      if (parsed.success) trips.push(toTrip(parsed.data));
    }
    if (trips.length < rows.length)
      this.logger.warn('Skipped unreadable trips', { skipped: rows.length - trips.length });
    return trips;
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

/** Columns in the order shared by INSERT (after `id`) and UPDATE. */
function editableValues(trip: StoredTrip): SqlValue[] {
  return [
    trip.title,
    trip.destinationId,
    trip.destinationName,
    trip.startDate,
    trip.endDate,
    trip.description,
    trip.coverImage,
    trip.budget,
    trip.currency,
    trip.cancelledAt,
  ];
}
