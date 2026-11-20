import { type Migration } from '@/core/database/migrations';

/**
 * Itinerary schema changes. Versions are global to the app database (see
 * `bootstrap/databaseMigrations.ts`); append new ones, never edit a shipped one.
 *
 * - `date` is `YYYY-MM-DD` and `start_time`/`end_time` are `HH:mm` wall-clock text
 *   at the destination, so nothing shifts when the device changes time zone.
 * - `estimated_cost_minor` is an integer in the currency's minor units.
 * - `sort_order` is the position within the day (0..n-1).
 * - `trip_id` cascades: deleting a trip deletes its activities. Foreign keys are
 *   switched on per connection by `SqliteDatabase`.
 * - `owner_id` is the signed-in account the activity belongs to. Every query filters on it.
 */
export const ITINERARY_MIGRATIONS: readonly Migration[] = [
  {
    version: 2,
    name: 'create activities',
    statements: [
      `CREATE TABLE activities (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL CHECK (length(owner_id) > 0),
        trip_id TEXT NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
        title TEXT NOT NULL CHECK (length(title) > 0),
        description TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL CHECK (category IN
          ('sightseeing', 'food', 'shopping', 'transportation', 'accommodation', 'entertainment', 'other')),
        date TEXT NOT NULL,
        start_time TEXT,
        end_time TEXT,
        latitude REAL,
        longitude REAL,
        address TEXT NOT NULL DEFAULT '',
        estimated_cost_minor INTEGER CHECK (estimated_cost_minor IS NULL OR estimated_cost_minor >= 0),
        currency TEXT NOT NULL CHECK (length(currency) = 3),
        notes TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
        is_completed INTEGER NOT NULL DEFAULT 0 CHECK (is_completed IN (0, 1)),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        CHECK (end_time IS NULL OR (start_time IS NOT NULL AND end_time > start_time)),
        CHECK ((latitude IS NULL) = (longitude IS NULL))
      )`,
      'CREATE INDEX idx_activities_owner_trip_date ON activities (owner_id, trip_id, date, sort_order)',
      // Lets the cascade from `trips` find a trip's rows without scanning the table.
      'CREATE INDEX idx_activities_trip ON activities (trip_id)',
    ],
  },
];
