import { z } from 'zod';

import { type SqlDatabase } from '@/core/database/SqlDatabase';
import { AppError } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { err, ok, type Result } from '@/core/result';

import { type Photo, PHOTO_SOURCES } from '../domain/Photo';
import { MAX_PHOTOS_PER_TRIP } from '../domain/imageValidation';
import { type PhotoRepository } from '../domain/repositories';

const COLUMNS =
  'id, trip_id, activity_id, reference, width, height, file_size, mime_type, source, taken_at, created_at';

// Same creation time (one attach) falls back to insertion order, last first.
const NEWEST_FIRST = 'ORDER BY created_at DESC, rowid DESC';

/**
 * Storage is untrusted input too: a row that doesn't describe a valid photo is
 * skipped. The reference is only checked for presence, so a row pointing at an
 * invalid file still shows up (as unavailable) and can be deleted.
 */
const photoRowSchema = z.object({
  id: z.string().min(1),
  trip_id: z.string().min(1),
  activity_id: z.string().min(1).nullable(),
  reference: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  file_size: z.number().int().positive(),
  mime_type: z.literal('image/jpeg'),
  source: z.enum(PHOTO_SOURCES),
  taken_at: z.number().nullable(),
  created_at: z.number(),
});

type PhotoRow = z.infer<typeof photoRowSchema>;

function toPhoto(row: PhotoRow): Photo {
  return {
    id: row.id,
    tripId: row.trip_id,
    activityId: row.activity_id,
    reference: row.reference,
    width: row.width,
    height: row.height,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    source: row.source,
    takenAt: row.taken_at,
    createdAt: row.created_at,
  };
}

/**
 * Photo metadata in the app's SQLite database (`photos`, migration 5). Every
 * statement is limited to `owner_id`, so one account can't read or change
 * another's photos, nor attach one to another account's trip or activity.
 */
export class LocalPhotoRepository implements PhotoRepository {
  constructor(
    private readonly database: SqlDatabase,
    private readonly logger: Logger,
  ) {}

  listByTrip(ownerId: string, tripId: string): Promise<Result<readonly Photo[], AppError>> {
    return this.attempt('load the photos', async () =>
      this.parseRows(
        await this.database.getAll(`SELECT ${COLUMNS} FROM photos WHERE owner_id = ? AND trip_id = ? ${NEWEST_FIRST}`, [
          ownerId,
          tripId,
        ]),
      ),
    );
  }

  listByActivity(ownerId: string, activityId: string): Promise<Result<readonly Photo[], AppError>> {
    return this.attempt('load the photos', async () =>
      this.parseRows(
        await this.database.getAll(
          `SELECT ${COLUMNS} FROM photos WHERE owner_id = ? AND activity_id = ? ${NEWEST_FIRST}`,
          [ownerId, activityId],
        ),
      ),
    );
  }

  findById(ownerId: string, id: string): Promise<Result<Photo | null, AppError>> {
    return this.attempt('load the photo', async () => {
      const row = await this.database.getFirst(`SELECT ${COLUMNS} FROM photos WHERE id = ? AND owner_id = ?`, [
        id,
        ownerId,
      ]);
      return row === null ? null : (this.parseRows([row])[0] ?? null);
    });
  }

  countByTrip(ownerId: string, tripId: string): Promise<Result<number, AppError>> {
    return this.attempt('count the photos', async () => {
      const row = await this.database.getFirst<{ count: number }>(
        'SELECT COUNT(*) AS count FROM photos WHERE owner_id = ? AND trip_id = ?',
        [ownerId, tripId],
      );
      return row?.count ?? 0;
    });
  }

  async insertMany(ownerId: string, photos: readonly Photo[]): Promise<Result<void, AppError>> {
    if (photos.length === 0) return ok(undefined);
    return this.attempt('save the photos', () =>
      this.database.transaction(async (tx) => {
        for (const photo of photos) {
          // The foreign keys only check that the trip and activity exist; these also check whose they are.
          const { changes } = await tx.run(
            `INSERT INTO photos (owner_id, ${COLUMNS})
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
             WHERE EXISTS (SELECT 1 FROM trips WHERE id = ? AND owner_id = ?)
               AND (? IS NULL OR EXISTS (SELECT 1 FROM activities WHERE id = ? AND owner_id = ? AND trip_id = ?))
               AND (SELECT COUNT(*) FROM photos WHERE owner_id = ? AND trip_id = ?) < ?`,
            [
              ownerId,
              photo.id,
              photo.tripId,
              photo.activityId,
              photo.reference,
              photo.width,
              photo.height,
              photo.fileSize,
              photo.mimeType,
              photo.source,
              photo.takenAt,
              photo.createdAt,
              photo.tripId,
              ownerId,
              photo.activityId,
              photo.activityId,
              ownerId,
              photo.tripId,
              ownerId,
              photo.tripId,
              MAX_PHOTOS_PER_TRIP,
            ],
          );
          if (changes === 0) {
            throw new Error(`Trip or activity of photo ${photo.id} not found for this account, or the trip is full`);
          }
        }
      }),
    );
  }

  async delete(ownerId: string, id: string): Promise<Result<void, AppError>> {
    const deleted = await this.attempt('delete the photo', async () => {
      const { changes } = await this.database.run('DELETE FROM photos WHERE id = ? AND owner_id = ?', [id, ownerId]);
      return changes > 0;
    });
    if (!deleted.ok) return deleted;
    return deleted.value ? ok(undefined) : err(new AppError('notFound', `Photo ${id} not found`));
  }

  allReferences(): Promise<Result<readonly string[], AppError>> {
    return this.attempt('read the photo references', async () => {
      const rows = await this.database.getAll<{ reference: unknown }>('SELECT reference FROM photos');
      return rows.flatMap(({ reference }) => (typeof reference === 'string' ? [reference] : []));
    });
  }

  private parseRows(rows: readonly unknown[]): Photo[] {
    const photos: Photo[] = [];
    for (const row of rows) {
      const parsed = photoRowSchema.safeParse(row);
      if (parsed.success) photos.push(toPhoto(parsed.data));
    }
    if (photos.length < rows.length) {
      this.logger.warn('Skipped unreadable photos', { skipped: rows.length - photos.length });
    }
    return photos;
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
