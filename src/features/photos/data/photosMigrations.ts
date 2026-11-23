import { type Migration } from '@/core/database/migrations';

/**
 * Photos schema changes (version 5: `photos`). Versions are global to the app
 * database (see `bootstrap/databaseMigrations.ts`); append new ones, never edit a
 * shipped one.
 *
 * - Only metadata and a relative file reference (`trip-photos/<name>`) are kept;
 *   the image itself stays in app storage.
 * - `trip_id` and `activity_id` cascade: deleting a trip or an activity deletes its
 *   rows. Their files are removed later by `PrunePhotoFiles`.
 * - `activity_id` is `NULL` for a photo of the trip itself.
 * - `owner_id` is the signed-in account the photo belongs to; every query filters on it.
 * - Stored photos are always re-encoded as JPEG.
 */
export const PHOTOS_MIGRATIONS: readonly Migration[] = [
  {
    version: 5,
    name: 'create photos',
    statements: [
      `CREATE TABLE photos (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL CHECK (length(owner_id) > 0),
        trip_id TEXT NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
        activity_id TEXT REFERENCES activities (id) ON DELETE CASCADE,
        reference TEXT NOT NULL UNIQUE CHECK (length(reference) > 0),
        width INTEGER NOT NULL CHECK (width > 0),
        height INTEGER NOT NULL CHECK (height > 0),
        file_size INTEGER NOT NULL CHECK (file_size > 0),
        mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg')),
        source TEXT NOT NULL CHECK (source IN ('camera', 'library')),
        taken_at INTEGER,
        created_at INTEGER NOT NULL
      )`,
      'CREATE INDEX idx_photos_owner_trip_created ON photos (owner_id, trip_id, created_at)',
      // Lets the cascade from `activities` (and the activity gallery) find rows without scanning the table.
      'CREATE INDEX idx_photos_activity ON photos (activity_id)',
    ],
  },
];
