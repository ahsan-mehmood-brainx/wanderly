import { z } from 'zod';

import { type SqlDatabase, type SqlExecutor, type SqlValue } from '@/core/database/SqlDatabase';
import { AppError } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { err, ok, type Result } from '@/core/result';
import { type LocalChangeKind, type LocalChangeLog, NO_CHANGE_LOG } from '@/core/sync/LocalChange';
import { isLocalDate, type LocalDate } from '@/features/trips/domain/localDate';
import { isCurrencyCode } from '@/features/trips/domain/money';

import { type Activity, ACTIVITY_CATEGORIES } from '../domain/Activity';
import { isLocalTime } from '../domain/localTime';
import { type ActivityRepository } from '../domain/repositories';

/** Entity type in the sync outbox. */
export const ACTIVITY_SYNC_ENTITY = 'activity';

const COLUMNS = `id, trip_id, title, description, category, date, start_time, end_time, latitude, longitude,
  address, estimated_cost_minor, currency, notes, sort_order, is_completed, created_at, updated_at`;

const localTime = z.string().refine(isLocalTime).nullable();

/** Storage is untrusted input too: a row that doesn't describe a valid activity is skipped, not shown half-broken. */
const activityRowSchema = z
  .object({
    id: z.string().min(1),
    trip_id: z.string().min(1),
    title: z.string().min(1),
    description: z.string(),
    category: z.enum(ACTIVITY_CATEGORIES),
    date: z.string().refine(isLocalDate),
    start_time: localTime,
    end_time: localTime,
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    address: z.string(),
    estimated_cost_minor: z.number().int().nonnegative().nullable(),
    currency: z.string().refine(isCurrencyCode),
    notes: z.string(),
    sort_order: z.number().int().nonnegative(),
    is_completed: z.union([z.literal(0), z.literal(1)]),
    created_at: z.number(),
    updated_at: z.number(),
  })
  .refine((row) => row.end_time === null || (row.start_time !== null && row.end_time > row.start_time))
  .refine((row) => (row.latitude === null) === (row.longitude === null));

function toActivity(row: z.infer<typeof activityRowSchema>): Activity {
  return {
    id: row.id,
    tripId: row.trip_id,
    title: row.title,
    description: row.description,
    category: row.category,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.address,
    estimatedCost: row.estimated_cost_minor,
    currency: row.currency,
    notes: row.notes,
    sortOrder: row.sort_order,
    isCompleted: row.is_completed === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface DayKey {
  readonly tripId: string;
  readonly date: LocalDate;
}

/**
 * Activities in the on-device SQLite database. No network is involved in any operation.
 * Every statement is limited to `owner_id`, so one account can't read or change another's activities.
 * Changes that move positions run in one transaction so a day is never left half-renumbered.
 */
export class LocalActivityRepository implements ActivityRepository {
  constructor(
    private readonly database: SqlDatabase,
    private readonly logger: Logger,
    private readonly changeLog: LocalChangeLog = NO_CHANGE_LOG,
  ) {}

  listByTrip(ownerId: string, tripId: string): Promise<Result<readonly Activity[], AppError>> {
    return this.attempt('load the itinerary', async () =>
      this.parseRows(
        await this.database.getAll(
          `SELECT ${COLUMNS} FROM activities WHERE owner_id = ? AND trip_id = ? ORDER BY date, sort_order, id`,
          [ownerId, tripId],
        ),
      ),
    );
  }

  findById(ownerId: string, id: string): Promise<Result<Activity | null, AppError>> {
    return this.attempt('load the activity', async () => {
      const row = await this.database.getFirst(`SELECT ${COLUMNS} FROM activities WHERE id = ? AND owner_id = ?`, [
        id,
        ownerId,
      ]);
      return row === null ? null : (this.parseRows([row])[0] ?? null);
    });
  }

  insert(ownerId: string, activity: Activity): Promise<Result<void, AppError>> {
    return this.attempt('save the activity', () =>
      this.database.transaction(async (tx) => {
        await tx.run(
          `INSERT INTO activities (owner_id, ${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ownerId,
            activity.id,
            activity.tripId,
            ...editableValues(activity),
            activity.isCompleted ? 1 : 0,
            activity.createdAt,
            activity.updatedAt,
          ],
        );
        const moved = await placeAt(tx, ownerId, activity, activity.sortOrder);
        await this.record(tx, ownerId, [activity.id], 'create');
        await this.record(tx, ownerId, without(moved, activity.id), 'update');
      }),
    );
  }

  async update(ownerId: string, activity: Activity): Promise<Result<void, AppError>> {
    const updated = await this.attempt('update the activity', () =>
      this.database.transaction(async (tx) => {
        const previous = await dayOf(tx, ownerId, activity.id);
        if (!previous) return false;
        await tx.run(
          `UPDATE activities SET title = ?, description = ?, category = ?, date = ?, start_time = ?, end_time = ?,
             latitude = ?, longitude = ?, address = ?, estimated_cost_minor = ?, currency = ?, notes = ?,
             sort_order = ?, is_completed = ?, updated_at = ?
           WHERE id = ? AND owner_id = ?`,
          [...editableValues(activity), activity.isCompleted ? 1 : 0, activity.updatedAt, activity.id, ownerId],
        );
        const moved = previous.date !== activity.date ? await renumber(tx, ownerId, previous) : [];
        moved.push(...(await placeAt(tx, ownerId, { ...activity, tripId: previous.tripId }, activity.sortOrder)));
        await this.record(tx, ownerId, [activity.id, ...without(moved, activity.id)], 'update');
        return true;
      }),
    );
    return this.requireFound(updated, activity.id);
  }

  async delete(ownerId: string, id: string): Promise<Result<void, AppError>> {
    const deleted = await this.attempt('delete the activity', () =>
      this.database.transaction(async (tx) => {
        const day = await dayOf(tx, ownerId, id);
        if (!day) return false;
        await tx.run('DELETE FROM activities WHERE id = ? AND owner_id = ?', [id, ownerId]);
        await this.record(tx, ownerId, [id], 'delete');
        await this.record(tx, ownerId, await renumber(tx, ownerId, day), 'update');
        return true;
      }),
    );
    return this.requireFound(deleted, id);
  }

  async setCompleted(
    ownerId: string,
    id: string,
    isCompleted: boolean,
    updatedAt: number,
  ): Promise<Result<void, AppError>> {
    const updated = await this.attempt('update the activity', () =>
      this.database.transaction(async (tx) => {
        const { changes } = await tx.run(
          'UPDATE activities SET is_completed = ?, updated_at = ? WHERE id = ? AND owner_id = ?',
          [isCompleted ? 1 : 0, updatedAt, id, ownerId],
        );
        if (changes > 0) await this.record(tx, ownerId, [id], 'update');
        return changes > 0;
      }),
    );
    return this.requireFound(updated, id);
  }

  async reorder(
    ownerId: string,
    tripId: string,
    date: LocalDate,
    orderedIds: readonly string[],
    updatedAt: number,
  ): Promise<Result<void, AppError>> {
    const reordered = await this.attempt('save the new order', () =>
      this.database.transaction(async (tx) => {
        // The order covers the activities the traveller can see; unreadable rows are skipped
        // everywhere else, so they keep their relative order after the readable ones.
        const rows = await tx.getAll(
          `SELECT ${COLUMNS} FROM activities WHERE owner_id = ? AND trip_id = ? AND date = ? ORDER BY sort_order, id`,
          [ownerId, tripId, date],
        );
        const current: string[] = [];
        const unreadable: string[] = [];
        for (const row of rows) {
          const parsed = activityRowSchema.safeParse(row);
          if (parsed.success) current.push(parsed.data.id);
          else if (isRowWithId(row)) unreadable.push(row.id);
        }
        const wanted = new Set(orderedIds);
        if (
          current.length === 0 ||
          wanted.size !== orderedIds.length ||
          current.length !== orderedIds.length ||
          current.some((id) => !wanted.has(id))
        ) {
          return false;
        }
        for (const [index, id] of [...orderedIds, ...unreadable].entries()) {
          await tx.run('UPDATE activities SET sort_order = ?, updated_at = ? WHERE id = ? AND owner_id = ?', [
            index,
            updatedAt,
            id,
            ownerId,
          ]);
        }
        await this.record(tx, ownerId, [...orderedIds, ...unreadable], 'update');
        return true;
      }),
    );
    return this.requireFound(reordered, `${tripId}/${date}`);
  }

  private record(tx: SqlExecutor, ownerId: string, ids: readonly string[], kind: LocalChangeKind) {
    return this.changeLog.record(
      tx,
      ids.map((entityId) => ({ ownerId, entityType: ACTIVITY_SYNC_ENTITY, entityId, kind })),
    );
  }

  private requireFound(result: Result<boolean, AppError>, id: string): Result<void, AppError> {
    if (!result.ok) return result;
    return result.value ? ok(undefined) : err(new AppError('notFound', `Activity ${id} not found`));
  }

  private parseRows(rows: readonly unknown[]): Activity[] {
    const activities: Activity[] = [];
    for (const row of rows) {
      const parsed = activityRowSchema.safeParse(row);
      if (parsed.success) activities.push(toActivity(parsed.data));
    }
    if (activities.length < rows.length) {
      this.logger.warn('Skipped unreadable activities', { skipped: rows.length - activities.length });
    }
    return activities;
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

/** Columns in the order shared by INSERT (after `id, trip_id`) and UPDATE. */
function editableValues(activity: Activity): SqlValue[] {
  return [
    activity.title,
    activity.description,
    activity.category,
    activity.date,
    activity.startTime,
    activity.endTime,
    activity.latitude,
    activity.longitude,
    activity.address,
    activity.estimatedCost,
    activity.currency,
    activity.notes,
    activity.sortOrder,
  ];
}

async function dayOf(tx: SqlExecutor, ownerId: string, id: string): Promise<DayKey | null> {
  const row = await tx.getFirst<{ trip_id: string; date: string }>(
    'SELECT trip_id, date FROM activities WHERE id = ? AND owner_id = ?',
    [id, ownerId],
  );
  return row === null ? null : { tripId: row.trip_id, date: row.date };
}

interface Position {
  readonly id: string;
  readonly sort_order: number;
}

function dayPositions(tx: SqlExecutor, ownerId: string, { tripId, date }: DayKey, exceptId: string | null = null) {
  return tx.getAll<Position>(
    `SELECT id, sort_order FROM activities
     WHERE owner_id = ? AND trip_id = ? AND date = ? AND (? IS NULL OR id <> ?)
     ORDER BY sort_order, id`,
    [ownerId, tripId, date, exceptId, exceptId],
  );
}

const isRowWithId = (row: unknown): row is { readonly id: string } =>
  typeof row === 'object' && row !== null && 'id' in row && typeof row.id === 'string';

const without = (ids: readonly string[], id: string) => ids.filter((candidate) => candidate !== id);

/**
 * Numbers `rows` 0..n-1 in the given order, writing only the rows whose position
 * changes. Returns their ids: a moved activity changed too, so it is synced.
 */
async function writePositions(tx: SqlExecutor, ownerId: string, rows: readonly Position[]): Promise<string[]> {
  const moved: string[] = [];
  for (const [index, row] of rows.entries()) {
    if (row.sort_order === index) continue;
    await tx.run('UPDATE activities SET sort_order = ? WHERE id = ? AND owner_id = ?', [index, row.id, ownerId]);
    moved.push(row.id);
  }
  return moved;
}

/** Closes the gap an activity left in its day. Returns the ids that moved. */
function renumber(tx: SqlExecutor, ownerId: string, day: DayKey): Promise<string[]> {
  return dayPositions(tx, ownerId, day).then((rows) => writePositions(tx, ownerId, rows));
}

/** Puts `activity` at `position` (clamped) on its day and numbers the day 0..n-1. Returns the ids that moved. */
async function placeAt(
  tx: SqlExecutor,
  ownerId: string,
  activity: Pick<Activity, 'id' | 'tripId' | 'date'>,
  position: number,
): Promise<string[]> {
  const others = await dayPositions(tx, ownerId, activity, activity.id);
  const index = Math.min(Math.max(position, 0), others.length);
  return writePositions(tx, ownerId, [
    ...others.slice(0, index),
    { id: activity.id, sort_order: position },
    ...others.slice(index),
  ]);
}
