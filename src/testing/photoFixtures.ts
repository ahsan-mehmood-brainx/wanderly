import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';
import { type Activity } from '@/features/itinerary/domain/Activity';
import { LocalPhotoRepository } from '@/features/photos/data/LocalPhotoRepository';
import { type Photo, type PickedImage } from '@/features/photos/domain/Photo';
import {
  type ImageProcessor,
  type ImageSource,
  type MediaKind,
  type MediaPermission,
  type MediaPermissionService,
  type PhotoFileStore,
  type PhotoLibraryPicker,
  type PickImagesOptions,
  type ProcessedImage,
  type ProcessImageOptions,
  type StoredPhotoFile,
} from '@/features/photos/domain/repositories';
import { type StoredTrip } from '@/features/trips/domain/Trip';

import { activity, createItineraryStorage } from './itineraryFixtures';
import { storedTrip, TRIP_OWNER, TRIPS_NOW } from './tripFixtures';

/** Photo tests run at 15 June 2027, 12:00 UTC, like trip tests. */
export const PHOTOS_NOW = TRIPS_NOW;

/** Runs 1–5 July 2027 (see `storedTrip`). */
export const PHOTOS_TRIP = storedTrip({ id: 'trip-1', title: 'Lisbon getaway' });

export const PHOTO_ACTIVITY: Activity = activity({ id: 'act-1', tripId: 'trip-1', title: 'Belém Tower' });

export function photo(overrides: Partial<Photo> = {}): Photo {
  return {
    id: 'photo-1',
    tripId: 'trip-1',
    activityId: null,
    reference: 'trip-photos/photo-1.jpg',
    width: 2048,
    height: 1536,
    fileSize: 512_000,
    mimeType: 'image/jpeg',
    source: 'library',
    takenAt: null,
    createdAt: PHOTOS_NOW,
    ...overrides,
  };
}

/** A 12 MP JPEG straight from the picker. */
export function pickedImage(overrides: Partial<PickedImage> = {}): PickedImage {
  return {
    uri: 'file:///cache/ImagePicker/a.jpg',
    width: 4032,
    height: 3024,
    fileSize: 3_000_000,
    mimeType: 'image/jpeg',
    fileName: 'IMG_0001.JPG',
    takenAt: null,
    source: 'library',
    ...overrides,
  };
}

/** Real in-memory SQLite with the trip, activity and photo repositories on it. */
export function createPhotoStorage() {
  const storage = createItineraryStorage();
  return { ...storage, photoRepository: new LocalPhotoRepository(storage.database, storage.logger) };
}

/**
 * Storage holding `trips`, then `activities`, then `photos`, all belonging to `ownerId`.
 * Photos of a trip that isn't in `trips` are left out: the schema can't hold them, and
 * a scenario that drops a trip can keep sharing one photo list.
 */
export async function seededPhotoDatabase(
  trips: readonly StoredTrip[] = [PHOTOS_TRIP],
  activities: readonly Activity[] = [PHOTO_ACTIVITY],
  photos: readonly Photo[] = [],
  ownerId = TRIP_OWNER,
) {
  const storage = createPhotoStorage();
  for (const trip of trips) {
    const saved = await storage.tripRepository.insert(ownerId, trip);
    if (!saved.ok) throw saved.error;
  }
  for (const item of activities) {
    const saved = await storage.activityRepository.insert(ownerId, item);
    if (!saved.ok) throw saved.error;
  }
  const tripIds = new Set(trips.map(({ id }) => id));
  const seeded = photos.filter(({ tripId }) => tripIds.has(tripId));
  if (seeded.length > 0) {
    const saved = await storage.photoRepository.insertMany(ownerId, seeded);
    if (!saved.ok) throw saved.error;
  }
  return storage;
}

const PHOTO_REFERENCE = /^trip-photos\/[A-Za-z0-9_-]+\.[a-z0-9]+$/;

/**
 * In-memory {@link PhotoFileStore}: imports become `trip-photos/stored-N.jpg`. Any
 * valid reference exists unless listed in `missing`; `files` is what `listStored` reports.
 */
export class FakePhotoFileStore implements PhotoFileStore {
  readonly supported: boolean = true;
  /** Reference → modification time. */
  readonly files = new Map<string, number>();
  readonly imported: string[] = [];
  readonly removed: string[] = [];
  readonly missing = new Set<string>();
  failImports = false;
  /** Fails only the Nth import (1-based). */
  failImportAt: number | null = null;
  listFailure: AppError | null = null;
  modifiedAt = PHOTOS_NOW;
  private next = 0;

  async importImage(sourceUri: string): Promise<Result<string, AppError>> {
    const attempt = this.imported.length + 1;
    if (this.failImports || this.failImportAt === attempt) {
      return err(new AppError('storage', `Could not copy ${sourceUri}`));
    }
    this.imported.push(sourceUri);
    const reference = `trip-photos/stored-${++this.next}.jpg`;
    this.files.set(reference, this.modifiedAt);
    return ok(reference);
  }

  isStoredReference(value: string): boolean {
    return PHOTO_REFERENCE.test(value);
  }

  async remove(reference: string): Promise<void> {
    this.removed.push(reference);
    this.files.delete(reference);
  }

  displayUri(reference: string): string | null {
    return this.isStoredReference(reference) ? `file:///documents/${reference}` : null;
  }

  exists(reference: string): boolean {
    return this.isStoredReference(reference) && !this.missing.has(reference);
  }

  async listStored(): Promise<Result<readonly StoredPhotoFile[], AppError>> {
    if (this.listFailure) return err(this.listFailure);
    return ok([...this.files].map(([reference, modifiedAt]) => ({ reference, modifiedAt })));
  }
}

/** Scales to fit `maxEdge` like the real processor; `failing` lists source URIs that can't be processed. */
export class FakeImageProcessor implements ImageProcessor {
  readonly failing = new Set<string>();
  readonly discarded: string[] = [];
  fileSize = 400_000;
  private next = 0;

  readonly process = jest.fn(
    async (source: ImageSource, options: ProcessImageOptions): Promise<Result<ProcessedImage, AppError>> => {
      if (this.failing.has(source.uri)) return err(new AppError('storage', `Could not process ${source.uri}`));
      const scale = Math.min(1, options.maxEdge / Math.max(source.width, source.height));
      return ok({
        uri: `file:///cache/ImageManipulator/processed-${++this.next}.jpg`,
        width: Math.round(source.width * scale),
        height: Math.round(source.height * scale),
        fileSize: this.fileSize,
      });
    },
  );

  async discard(uri: string): Promise<void> {
    this.discarded.push(uri);
  }
}

/**
 * Stateful {@link MediaPermissionService} per kind: no native modules. Both start
 * `undetermined`; `answerPromptWith` decides what the "user" picks at the prompt.
 */
export class FakeMediaPermissionService implements MediaPermissionService {
  permissions: Record<MediaKind, MediaPermission> = { camera: 'undetermined', library: 'undetermined' };
  answerPromptWith: Record<MediaKind, MediaPermission> = { camera: 'granted', library: 'granted' };

  readonly getPermission = jest.fn(async (kind: MediaKind): Promise<MediaPermission> => this.permissions[kind]);

  readonly requestPermission = jest.fn(async (kind: MediaKind): Promise<MediaPermission> => {
    const current = this.permissions[kind];
    if (current === 'undetermined' || current === 'denied') this.permissions[kind] = this.answerPromptWith[kind];
    return this.permissions[kind];
  });

  allow(...kinds: MediaKind[]): this {
    for (const kind of kinds) this.permissions[kind] = 'granted';
    return this;
  }
}

export class FakePhotoLibraryPicker implements PhotoLibraryPicker {
  result: Result<readonly PickedImage[] | null, AppError> = ok(null);
  readonly pickImages = jest.fn(async (_options: PickImagesOptions) => this.result);
}
