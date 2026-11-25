import { z } from 'zod';

import { type SqlDatabase, type SqlExecutor } from '@/core/database/SqlDatabase';
import { AppError } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { err, ok, type Result } from '@/core/result';
import { type LocalChangeKind, type LocalChangeLog, NO_CHANGE_LOG } from '@/core/sync/LocalChange';

import {
  type Collection,
  type CollectionMembership,
  compareCollections,
  DEFAULT_COLLECTION_KEYS,
  DEFAULT_COLLECTIONS,
  MAX_CUSTOM_COLLECTIONS,
} from '../domain/Collection';
import { isCollectionNameTaken } from '../domain/collectionValidation';
import { type Favorite, FAVORITE_CATEGORIES } from '../domain/Favorite';
import { type CollectionWriteOutcome, type FavoritesRepository, type FavoritesSnapshot } from '../domain/repositories';

const FAVORITE_COLUMNS =
  'id, target_id, category, name, subtitle, image_url, flag_emoji, latitude, longitude, address, saved_at';
const COLLECTION_COLUMNS = 'id, kind, default_key, name, created_at, updated_at';

/** Storage is untrusted input too: a row that doesn't describe a valid favorite is skipped, not shown half-broken. */
const favoriteRowSchema = z
  .object({
    id: z.string().min(1),
    target_id: z.string().min(1),
    category: z.enum(FAVORITE_CATEGORIES),
    name: z.string().min(1),
    subtitle: z.string().nullable(),
    image_url: z.string().nullable(),
    flag_emoji: z.string().nullable(),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    address: z.string().nullable(),
    saved_at: z.number(),
  })
  .refine((row) => (row.latitude === null) === (row.longitude === null));

const collectionRowSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string().min(1),
    kind: z.literal('default'),
    default_key: z.enum(DEFAULT_COLLECTION_KEYS),
    name: z.null(),
    created_at: z.number(),
    updated_at: z.number(),
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal('custom'),
    default_key: z.null(),
    name: z.string().trim().min(1),
    created_at: z.number(),
    updated_at: z.number(),
  }),
]);

const membershipRowSchema = z.object({
  collection_id: z.string().min(1),
  favorite_id: z.string().min(1),
  added_at: z.number(),
});

function toFavorite(row: z.infer<typeof favoriteRowSchema>): Favorite {
  return {
    id: row.id,
    targetId: row.target_id,
    category: row.category,
    name: row.name,
    subtitle: row.subtitle,
    imageUrl: row.image_url,
    flagEmoji: row.flag_emoji,
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.address,
    savedAt: row.saved_at,
  };
}

function toCollection(row: z.infer<typeof collectionRowSchema>): Collection {
  return {
    id: row.id,
    kind: row.kind,
    defaultKey: row.default_key,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMembership(row: z.infer<typeof membershipRowSchema>): CollectionMembership {
  return { collectionId: row.collection_id, favoriteId: row.favorite_id, addedAt: row.added_at };
}

/** Entity types in the sync outbox. Collection memberships are part of the favorite's state. */
export const FAVORITE_SYNC_ENTITY = 'favorite';
export const COLLECTION_SYNC_ENTITY = 'collection';

const refused = (reason: 'duplicate' | 'limitReached'): CollectionWriteOutcome => ({ status: 'refused', reason });

const exists = async (tx: SqlExecutor, sql: string, params: readonly string[]) =>
  (await tx.getFirst(sql, params)) !== null;

/**
 * Favorites, collections and memberships in the on-device SQLite database
 * (migration 3). Every statement is limited to `owner_id`, so one account can't
 * read or change another's. No network is involved in any operation. Every change
 * to a favorite or a custom collection is recorded in the sync outbox in the same
 * transaction (default collections exist on every device and aren't recorded).
 */
export class LocalFavoritesRepository implements FavoritesRepository {
  constructor(
    private readonly database: SqlDatabase,
    private readonly logger: Logger,
    private readonly changeLog: LocalChangeLog = NO_CHANGE_LOG,
  ) {}

  loadAll(ownerId: string): Promise<Result<FavoritesSnapshot, AppError>> {
    return this.attempt('load saved places', async () => {
      const [favoriteRows, collectionRows, membershipRows] = await Promise.all([
        this.database.getAll(
          `SELECT ${FAVORITE_COLUMNS} FROM favorites WHERE owner_id = ? ORDER BY saved_at DESC, id`,
          [ownerId],
        ),
        this.database.getAll(`SELECT ${COLLECTION_COLUMNS} FROM collections WHERE owner_id = ?`, [ownerId]),
        this.database.getAll(
          `SELECT collection_id, favorite_id, added_at FROM collection_items
           WHERE owner_id = ? ORDER BY added_at, collection_id, favorite_id`,
          [ownerId],
        ),
      ]);
      const favorites = this.parse(favoriteRows, favoriteRowSchema, toFavorite, 'saved places');
      const collections = this.parse(collectionRows, collectionRowSchema, toCollection, 'collections').sort(
        compareCollections,
      );
      // Memberships of skipped rows would count places nobody can see.
      const favoriteIds = new Set(favorites.map(({ id }) => id));
      const collectionIds = new Set(collections.map(({ id }) => id));
      const memberships = this.parse(
        membershipRows,
        membershipRowSchema,
        toMembership,
        'collection memberships',
      ).filter((item) => favoriteIds.has(item.favoriteId) && collectionIds.has(item.collectionId));
      return { favorites, collections, memberships };
    });
  }

  ensureDefaultCollections(ownerId: string, now: number): Promise<Result<void, AppError>> {
    return this.attempt('create the default collections', () =>
      this.database.transaction(async (tx) => {
        for (const { id, key } of DEFAULT_COLLECTIONS) {
          await tx.run(
            `INSERT OR IGNORE INTO collections (owner_id, ${COLLECTION_COLUMNS}) VALUES (?, ?, 'default', ?, NULL, ?, ?)`,
            [ownerId, id, key, now, now],
          );
        }
      }),
    );
  }

  findByTarget(ownerId: string, targetId: string): Promise<Result<Favorite | null, AppError>> {
    return this.attempt('load the saved place', () => this.selectByTarget(this.database, ownerId, targetId));
  }

  async insertFavorite(ownerId: string, favorite: Favorite): Promise<Result<Favorite, AppError>> {
    const stored = await this.attempt('save the place', () =>
      this.database.transaction(async (tx) => {
        // A second save of the same target (double tap, two screens) keeps the first row.
        const { changes } = await tx.run(
          `INSERT INTO favorites (owner_id, ${FAVORITE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (owner_id, target_id) DO NOTHING`,
          [
            ownerId,
            favorite.id,
            favorite.targetId,
            favorite.category,
            favorite.name,
            favorite.subtitle,
            favorite.imageUrl,
            favorite.flagEmoji,
            favorite.latitude,
            favorite.longitude,
            favorite.address,
            favorite.savedAt,
          ],
        );
        if (changes > 0) await this.recordFavorite(tx, ownerId, favorite.id, 'create');
        return this.selectByTarget(tx, ownerId, favorite.targetId);
      }),
    );
    if (!stored.ok) return stored;
    return stored.value
      ? ok(stored.value)
      : err(new AppError('storage', `Saved place ${favorite.targetId} could not be read back`));
  }

  async deleteFavorite(ownerId: string, favoriteId: string): Promise<Result<void, AppError>> {
    const deleted = await this.attempt('remove the saved place', () =>
      this.database.transaction(async (tx) => {
        const { changes } = await tx.run('DELETE FROM favorites WHERE id = ? AND owner_id = ?', [favoriteId, ownerId]);
        if (changes > 0) await this.recordFavorite(tx, ownerId, favoriteId, 'delete');
        return changes > 0;
      }),
    );
    return requireFound(deleted, `Saved place ${favoriteId}`);
  }

  insertCollection(ownerId: string, collection: Collection): Promise<Result<CollectionWriteOutcome, AppError>> {
    return this.attempt('save the collection', () =>
      // Checked and written in one transaction, so two saves can't both pass the checks.
      this.database.transaction(async (tx): Promise<CollectionWriteOutcome> => {
        if (collection.kind === 'custom') {
          const custom = await this.customCollections(tx, ownerId);
          if (isCollectionNameTaken(collection.name ?? '', custom)) return refused('duplicate');
          if (custom.length >= MAX_CUSTOM_COLLECTIONS) return refused('limitReached');
        }
        await tx.run(`INSERT INTO collections (owner_id, ${COLLECTION_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
          ownerId,
          collection.id,
          collection.kind,
          collection.defaultKey,
          collection.name,
          collection.createdAt,
          collection.updatedAt,
        ]);
        if (collection.kind === 'custom') await this.recordCollection(tx, ownerId, collection.id, 'create');
        return { status: 'saved', collection };
      }),
    );
  }

  async renameCollection(
    ownerId: string,
    id: string,
    name: string,
    updatedAt: number,
  ): Promise<Result<CollectionWriteOutcome, AppError>> {
    const renamed = await this.attempt('rename the collection', () =>
      this.database.transaction(async (tx): Promise<CollectionWriteOutcome | null> => {
        const custom = await this.customCollections(tx, ownerId);
        const existing = custom.find((item) => item.id === id);
        if (!existing) return null;
        if (isCollectionNameTaken(name, custom, id)) return refused('duplicate');
        await tx.run(
          "UPDATE collections SET name = ?, updated_at = ? WHERE owner_id = ? AND id = ? AND kind = 'custom'",
          [name, updatedAt, ownerId, id],
        );
        await this.recordCollection(tx, ownerId, id, 'update');
        return { status: 'saved', collection: { ...existing, name, updatedAt } };
      }),
    );
    if (!renamed.ok) return renamed;
    return renamed.value ? ok(renamed.value) : err(new AppError('notFound', `Collection ${id} not found`));
  }

  async deleteCollection(ownerId: string, id: string): Promise<Result<void, AppError>> {
    const deleted = await this.attempt('delete the collection', () =>
      this.database.transaction(async (tx) => {
        const { changes } = await tx.run("DELETE FROM collections WHERE owner_id = ? AND id = ? AND kind = 'custom'", [
          ownerId,
          id,
        ]);
        if (changes > 0) await this.recordCollection(tx, ownerId, id, 'delete');
        return changes > 0;
      }),
    );
    return requireFound(deleted, `Collection ${id}`);
  }

  async setMemberships(
    ownerId: string,
    favoriteId: string,
    collectionIds: readonly string[],
    now: number,
  ): Promise<Result<readonly CollectionMembership[], AppError>> {
    const wanted = [...new Set(collectionIds)];
    const saved = await this.attempt('save the collections', () =>
      this.database.transaction(async (tx): Promise<CollectionMembership[] | null> => {
        if (!(await exists(tx, 'SELECT 1 FROM favorites WHERE id = ? AND owner_id = ?', [favoriteId, ownerId]))) {
          return null;
        }
        for (const collectionId of wanted) {
          if (!(await exists(tx, 'SELECT 1 FROM collections WHERE owner_id = ? AND id = ?', [ownerId, collectionId]))) {
            return null;
          }
        }
        const current = await tx.getAll<{ collection_id: string }>(
          'SELECT collection_id FROM collection_items WHERE owner_id = ? AND favorite_id = ?',
          [ownerId, favoriteId],
        );
        for (const { collection_id: collectionId } of current) {
          if (wanted.includes(collectionId)) continue;
          await tx.run('DELETE FROM collection_items WHERE owner_id = ? AND collection_id = ? AND favorite_id = ?', [
            ownerId,
            collectionId,
            favoriteId,
          ]);
        }
        for (const collectionId of wanted) {
          await tx.run(
            `INSERT OR IGNORE INTO collection_items (owner_id, collection_id, favorite_id, added_at)
             VALUES (?, ?, ?, ?)`,
            [ownerId, collectionId, favoriteId, now],
          );
        }
        await this.recordFavorite(tx, ownerId, favoriteId, 'update');
        const rows = await tx.getAll(
          `SELECT collection_id, favorite_id, added_at FROM collection_items
           WHERE owner_id = ? AND favorite_id = ? ORDER BY added_at, collection_id`,
          [ownerId, favoriteId],
        );
        return this.parse(rows, membershipRowSchema, toMembership, 'collection memberships');
      }),
    );
    if (!saved.ok) return saved;
    return saved.value
      ? ok(saved.value)
      : err(new AppError('notFound', `Saved place ${favoriteId} or one of its collections not found`));
  }

  async removeMembership(ownerId: string, collectionId: string, favoriteId: string): Promise<Result<void, AppError>> {
    const removed = await this.attempt('remove the place from the collection', () =>
      this.database.transaction(async (tx) => {
        const { changes } = await tx.run(
          'DELETE FROM collection_items WHERE owner_id = ? AND collection_id = ? AND favorite_id = ?',
          [ownerId, collectionId, favoriteId],
        );
        if (changes > 0) await this.recordFavorite(tx, ownerId, favoriteId, 'update');
        return changes > 0;
      }),
    );
    return requireFound(removed, `Saved place ${favoriteId} in collection ${collectionId}`);
  }

  private recordFavorite(tx: SqlExecutor, ownerId: string, entityId: string, kind: LocalChangeKind) {
    return this.changeLog.record(tx, { ownerId, entityType: FAVORITE_SYNC_ENTITY, entityId, kind });
  }

  private recordCollection(tx: SqlExecutor, ownerId: string, entityId: string, kind: LocalChangeKind) {
    return this.changeLog.record(tx, { ownerId, entityType: COLLECTION_SYNC_ENTITY, entityId, kind });
  }

  /** The owner's readable custom collections. */
  private async customCollections(tx: SqlExecutor, ownerId: string): Promise<Collection[]> {
    const rows = await tx.getAll(
      `SELECT ${COLLECTION_COLUMNS} FROM collections WHERE owner_id = ? AND kind = 'custom'`,
      [ownerId],
    );
    return this.parse(rows, collectionRowSchema, toCollection, 'collections');
  }

  private async selectByTarget(tx: SqlExecutor, ownerId: string, targetId: string): Promise<Favorite | null> {
    const row = await tx.getFirst(`SELECT ${FAVORITE_COLUMNS} FROM favorites WHERE owner_id = ? AND target_id = ?`, [
      ownerId,
      targetId,
    ]);
    return row === null ? null : (this.parse([row], favoriteRowSchema, toFavorite, 'saved places')[0] ?? null);
  }

  private parse<Row, T>(rows: readonly unknown[], schema: z.ZodType<Row>, convert: (row: Row) => T, what: string): T[] {
    const items: T[] = [];
    for (const row of rows) {
      const parsed = schema.safeParse(row);
      if (parsed.success) items.push(convert(parsed.data));
    }
    if (items.length < rows.length) {
      this.logger.warn(`Skipped unreadable ${what}`, { skipped: rows.length - items.length });
    }
    return items;
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

function requireFound(result: Result<boolean, AppError>, what: string): Result<void, AppError> {
  if (!result.ok) return result;
  return result.value ? ok(undefined) : err(new AppError('notFound', `${what} not found`));
}
