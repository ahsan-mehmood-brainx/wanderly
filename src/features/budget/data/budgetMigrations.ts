import { type Migration } from '@/core/database/migrations';

/**
 * Budget schema changes (version 4: `expenses` and `exchange_rates`). Versions are
 * global to the app database (see `bootstrap/databaseMigrations.ts`); append new
 * ones, never edit a shipped one.
 *
 * - Amounts are integers in the currency's minor units; rates are decimal TEXT so
 *   they are never rounded through a float.
 * - `base_amount_minor`, `exchange_rate`, `rate_date` and `rate_source` are all set
 *   or all `NULL` (an expense saved while no rate was available).
 * - `trip_id` cascades: deleting a trip deletes its expenses. `owner_id` is the
 *   signed-in account the expense belongs to; every query filters on it.
 * - `exchange_rates` holds public data, so it is shared by every account.
 *   `requested_date` is `YYYY-MM-DD` or `latest`.
 */
export const BUDGET_MIGRATIONS: readonly Migration[] = [
  {
    version: 4,
    name: 'create expenses and exchange_rates',
    statements: [
      `CREATE TABLE expenses (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL CHECK (length(owner_id) > 0),
        trip_id TEXT NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
        title TEXT NOT NULL CHECK (length(title) > 0),
        amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
        currency TEXT NOT NULL CHECK (length(currency) = 3),
        base_currency TEXT NOT NULL CHECK (length(base_currency) = 3),
        base_amount_minor INTEGER CHECK (base_amount_minor IS NULL OR base_amount_minor >= 0),
        exchange_rate TEXT,
        rate_date TEXT,
        rate_source TEXT CHECK (rate_source IS NULL OR rate_source IN ('identity', 'api', 'fallback', 'manual')),
        category TEXT NOT NULL CHECK (category IN
          ('food', 'transport', 'accommodation', 'shopping', 'entertainment', 'activities', 'healthcare', 'other')),
        date TEXT NOT NULL,
        payment_method TEXT NOT NULL CHECK (payment_method IN
          ('cash', 'card', 'mobileWallet', 'bankTransfer', 'other')),
        notes TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        CHECK ((base_amount_minor IS NULL) = (exchange_rate IS NULL)),
        CHECK ((exchange_rate IS NULL) = (rate_date IS NULL)),
        CHECK ((exchange_rate IS NULL) = (rate_source IS NULL))
      )`,
      'CREATE INDEX idx_expenses_owner_trip_date ON expenses (owner_id, trip_id, date, created_at)',
      // Lets the cascade from `trips` find a trip's rows without scanning the table.
      'CREATE INDEX idx_expenses_trip ON expenses (trip_id)',
      `CREATE TABLE exchange_rates (
        base TEXT NOT NULL CHECK (length(base) = 3),
        quote TEXT NOT NULL CHECK (length(quote) = 3),
        requested_date TEXT NOT NULL,
        rate TEXT NOT NULL,
        rate_date TEXT NOT NULL,
        fetched_at INTEGER NOT NULL,
        PRIMARY KEY (base, quote, requested_date)
      )`,
    ],
  },
];
