import { type Migration } from '@/core/database/migrations';

/**
 * Trip schema changes. Versions are global to the app database (see
 * `bootstrap/databaseMigrations.ts`); append new ones, never edit a shipped one.
 *
 * - Dates are `YYYY-MM-DD` text, which sorts and compares chronologically.
 * - `budget_minor` is an integer in the currency's minor units.
 * - Status isn't a column: it depends on today's date. Only cancellation is stored.
 * - `owner_id` is the signed-in account the trip belongs to. Every query filters on it.
 */
export const TRIP_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'create trips',
    statements: [
      `CREATE TABLE trips (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL CHECK (length(owner_id) > 0),
        title TEXT NOT NULL CHECK (length(title) > 0),
        destination_id TEXT NOT NULL CHECK (length(destination_id) > 0),
        destination_name TEXT NOT NULL CHECK (length(destination_name) > 0),
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        cover_image TEXT,
        budget_minor INTEGER NOT NULL CHECK (budget_minor > 0),
        currency TEXT NOT NULL CHECK (length(currency) = 3),
        cancelled_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        CHECK (end_date >= start_date)
      )`,
      'CREATE INDEX idx_trips_owner_dates ON trips (owner_id, start_date, end_date)',
    ],
  },
];
