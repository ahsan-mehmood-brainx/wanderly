import { type Migration } from '@/core/database/migrations';

/**
 * Favorites schema changes. Versions are global to the app database (see
 * `bootstrap/databaseMigrations.ts`); append new ones, never edit a shipped one.
 *
 * - `owner_id` is the signed-in account the row belongs to. Every query filters on it.
 * - `UNIQUE (owner_id, target_id)`: an account saves each destination or place once.
 * - Collections are keyed by `(owner_id, id)` so every account has the default
 *   collections under the same fixed ids.
 * - `collection_items` cascades from both sides: deleting a favorite or a collection
 *   deletes its memberships, never the other side. Foreign keys are switched on per
 *   connection by `SqliteDatabase`.
 */
export const FAVORITES_MIGRATIONS: readonly Migration[] = [
  {
    version: 3,
    name: 'create favorites and collections',
    statements: [
      `CREATE TABLE favorites (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL CHECK (length(owner_id) > 0),
        target_id TEXT NOT NULL CHECK (length(target_id) > 0),
        category TEXT NOT NULL CHECK (category IN ('destination', 'country', 'attraction', 'restaurant', 'landmark')),
        name TEXT NOT NULL CHECK (length(name) > 0),
        subtitle TEXT,
        image_url TEXT,
        flag_emoji TEXT,
        latitude REAL,
        longitude REAL,
        address TEXT,
        saved_at INTEGER NOT NULL,
        UNIQUE (owner_id, target_id),
        CHECK ((latitude IS NULL) = (longitude IS NULL))
      )`,
      'CREATE INDEX idx_favorites_owner_saved ON favorites (owner_id, saved_at)',
      `CREATE TABLE collections (
        owner_id TEXT NOT NULL CHECK (length(owner_id) > 0),
        id TEXT NOT NULL CHECK (length(id) > 0),
        kind TEXT NOT NULL CHECK (kind IN ('default', 'custom')),
        default_key TEXT CHECK (default_key IS NULL OR default_key IN
          ('wantToVisit', 'mustVisit', 'favoriteRestaurants', 'favoriteAttractions')),
        name TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (owner_id, id),
        CHECK (
          (kind = 'default' AND default_key IS NOT NULL AND name IS NULL)
          OR (kind = 'custom' AND default_key IS NULL AND name IS NOT NULL AND length(trim(name)) > 0)
        )
      )`,
      `CREATE TABLE collection_items (
        owner_id TEXT NOT NULL,
        collection_id TEXT NOT NULL,
        favorite_id TEXT NOT NULL REFERENCES favorites (id) ON DELETE CASCADE,
        added_at INTEGER NOT NULL,
        PRIMARY KEY (owner_id, collection_id, favorite_id),
        FOREIGN KEY (owner_id, collection_id) REFERENCES collections (owner_id, id) ON DELETE CASCADE
      )`,
      // Lets the cascade from `favorites` find a favorite's memberships without scanning the table.
      'CREATE INDEX idx_collection_items_favorite ON collection_items (favorite_id)',
    ],
  },
];
