import { type Migration } from '@/core/database/migrations';
import { FAVORITES_MIGRATIONS } from '@/features/favorites/data/favoritesMigrations';
import { ITINERARY_MIGRATIONS } from '@/features/itinerary/data/itineraryMigrations';
import { TRIP_MIGRATIONS } from '@/features/trips/data/tripMigrations';

export const APP_DATABASE_NAME = 'wanderly.db';

/**
 * Every schema change of the app database, in order. `PRAGMA user_version` is one
 * number per file, so features share a single version sequence: a feature that
 * adds tables continues the numbering and is appended here.
 */
export const APP_MIGRATIONS: readonly Migration[] = [
  ...TRIP_MIGRATIONS,
  ...ITINERARY_MIGRATIONS,
  ...FAVORITES_MIGRATIONS,
];
