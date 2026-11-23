import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';
import { type Clock } from '@/core/utils/Clock';
import { type IdGenerator } from '@/core/utils/IdGenerator';
import { type ActivityRepository } from '@/features/itinerary/domain/repositories';
import { type TripOwnerProvider, type TripRepository } from '@/features/trips/domain/repositories';

import {
  type ImageRejection,
  JPEG_QUALITY,
  MAX_EDGE,
  MAX_PHOTOS_PER_TRIP,
  MAX_SELECTION,
  validatePickedImage,
} from '../imageValidation';
import { type Photo, type PickedImage } from '../Photo';
import {
  type ImageProcessor,
  type MediaKind,
  type MediaPermission,
  type MediaPermissionService,
  type PhotoFileStore,
  type PhotoLibraryPicker,
  type PhotoRepository,
} from '../repositories';

/** Why one image of a selection was not attached. */
export type AttachRejection = ImageRejection | 'limitReached';

export interface RejectedImage {
  /** Position in the selection. */
  readonly index: number;
  readonly reason: AttachRejection;
}

export interface AttachPhotosInput {
  readonly tripId: string;
  readonly activityId: string | null;
  readonly images: readonly PickedImage[];
}

export type AttachPhotosOutcome =
  /** The valid images were saved; `rejected` lists the others. */
  | { readonly status: 'saved'; readonly photos: readonly Photo[]; readonly rejected: readonly RejectedImage[] }
  /** No image could be attached; nothing was saved. */
  | { readonly status: 'invalid'; readonly rejected: readonly RejectedImage[] }
  /** Nothing was saved and no file was left behind (`storage`, `notFound`, `unauthorized`). */
  | { readonly status: 'failed'; readonly error: AppError };

export interface ActivityPhotosInput {
  readonly tripId: string;
  readonly activityId: string;
}

/** Stored files no photo references are only removed once older than this, so an attach in progress is never raced. */
export const PRUNE_MIN_AGE_MS = 60 * 60 * 1000;

/** Library access that still lets the traveller pick photos. */
export function allowsAccess(permission: MediaPermission): boolean {
  return permission === 'granted' || permission === 'limited';
}

/**
 * The account to act for, read once per operation so every step applies to the
 * same account even if the session changes meanwhile.
 */
function requireOwner(owners: TripOwnerProvider): Result<string, AppError> {
  const ownerId = owners.currentOwnerId();
  return ownerId === null ? err(new AppError('unauthorized', 'No signed-in account for photos')) : ok(ownerId);
}

async function requireTrip(trips: TripRepository, ownerId: string, tripId: string): Promise<Result<void, AppError>> {
  const found = await trips.findById(ownerId, tripId);
  if (!found.ok) return found;
  return found.value ? ok(undefined) : err(new AppError('notFound', `Trip ${tripId} not found`));
}

/** `notFound` unless the activity exists for the owner and belongs to `tripId`. */
async function requireActivityOfTrip(
  activities: ActivityRepository,
  ownerId: string,
  tripId: string,
  activityId: string,
): Promise<Result<void, AppError>> {
  const found = await activities.findById(ownerId, activityId);
  if (!found.ok) return found;
  return found.value?.tripId === tripId
    ? ok(undefined)
    : err(new AppError('notFound', `Activity ${activityId} not found in trip ${tripId}`));
}

/** The trip's photos (its activities' included), newest first; `notFound` for a trip the account doesn't have. */
export class GetTripPhotos implements UseCase<string, Result<readonly Photo[], AppError>> {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly trips: TripRepository,
    private readonly owners: TripOwnerProvider,
  ) {}

  async execute(tripId: string): Promise<Result<readonly Photo[], AppError>> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return owner;
    const trip = await requireTrip(this.trips, owner.value, tripId);
    if (!trip.ok) return trip;
    return this.photos.listByTrip(owner.value, tripId);
  }
}

/** The activity's photos, newest first; `notFound` unless the activity belongs to that trip and account. */
export class GetActivityPhotos implements UseCase<ActivityPhotosInput, Result<readonly Photo[], AppError>> {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly activities: ActivityRepository,
    private readonly owners: TripOwnerProvider,
  ) {}

  async execute({ tripId, activityId }: ActivityPhotosInput): Promise<Result<readonly Photo[], AppError>> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return owner;
    const activity = await requireActivityOfTrip(this.activities, owner.value, tripId, activityId);
    if (!activity.ok) return activity;
    return this.photos.listByActivity(owner.value, activityId);
  }
}

/**
 * Validates, resizes and copies each image into app storage (one at a time), then
 * saves every row in one transaction. A failure after a copy removes every copied
 * file and saves nothing.
 */
export class AttachPhotos implements UseCase<AttachPhotosInput, AttachPhotosOutcome> {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly trips: TripRepository,
    private readonly activities: ActivityRepository,
    private readonly owners: TripOwnerProvider,
    private readonly files: PhotoFileStore,
    private readonly processor: ImageProcessor,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute({ tripId, activityId, images }: AttachPhotosInput): Promise<AttachPhotosOutcome> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return { status: 'failed', error: owner.error };
    const ownerId = owner.value;

    const trip = await requireTrip(this.trips, ownerId, tripId);
    if (!trip.ok) return { status: 'failed', error: trip.error };
    if (activityId !== null) {
      const activity = await requireActivityOfTrip(this.activities, ownerId, tripId, activityId);
      if (!activity.ok) return { status: 'failed', error: activity.error };
    }

    const count = await this.photos.countByTrip(ownerId, tripId);
    if (!count.ok) return { status: 'failed', error: count.error };
    let room = Math.max(0, MAX_PHOTOS_PER_TRIP - count.value);

    const accepted: PickedImage[] = [];
    const rejected: RejectedImage[] = [];
    images.forEach((image, index) => {
      const validation = validatePickedImage(image);
      if (!validation.ok) {
        rejected.push({ index, reason: validation.reason });
      } else if (room === 0) {
        rejected.push({ index, reason: 'limitReached' });
      } else {
        room -= 1;
        accepted.push(image);
      }
    });
    if (accepted.length === 0) return { status: 'invalid', rejected };

    const now = this.clock.now();
    const imported: string[] = [];
    const photos: Photo[] = [];
    const abandon = async (error: AppError): Promise<AttachPhotosOutcome> => {
      for (const reference of imported) await this.files.remove(reference);
      return { status: 'failed', error };
    };

    // One image at a time: decoding several full-size photos at once can run a phone out of memory.
    for (const image of accepted) {
      const processed = await this.processor.process(
        { uri: image.uri, width: image.width, height: image.height },
        { maxEdge: MAX_EDGE, quality: JPEG_QUALITY },
      );
      if (!processed.ok) return abandon(processed.error);
      const stored = await this.files.importImage(processed.value.uri);
      await this.processor.discard(processed.value.uri);
      if (!stored.ok) return abandon(stored.error);
      imported.push(stored.value);
      photos.push({
        id: this.idGenerator(),
        tripId,
        activityId,
        reference: stored.value,
        width: processed.value.width,
        height: processed.value.height,
        fileSize: processed.value.fileSize,
        mimeType: 'image/jpeg',
        source: image.source,
        takenAt: image.takenAt,
        createdAt: now,
      });
    }

    const saved = await this.photos.insertMany(ownerId, photos);
    if (!saved.ok) return abandon(saved.error);
    return { status: 'saved', photos, rejected };
  }
}

/** Deletes the photo's row, then its file (best effort). */
export class DeletePhoto implements UseCase<string, Result<void, AppError>> {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly owners: TripOwnerProvider,
    private readonly files: PhotoFileStore,
  ) {}

  async execute(id: string): Promise<Result<void, AppError>> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return owner;
    const found = await this.photos.findById(owner.value, id);
    if (!found.ok) return found;
    if (!found.value) return err(new AppError('notFound', `Photo ${id} not found`));

    const deleted = await this.photos.delete(owner.value, id);
    if (!deleted.ok) return deleted;
    await this.files.remove(found.value.reference);
    return ok(undefined);
  }
}

/** Removes stored photo files no row references (any account) once older than {@link PRUNE_MIN_AGE_MS}. Returns how many. */
export class PrunePhotoFiles implements UseCase<void, Result<number, AppError>> {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly files: PhotoFileStore,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<Result<number, AppError>> {
    const stored = await this.files.listStored();
    if (!stored.ok) return stored;
    const references = await this.photos.allReferences();
    if (!references.ok) return references;

    const kept = new Set(references.value);
    const cutoff = this.clock.now() - PRUNE_MIN_AGE_MS;
    const orphans = stored.value.filter(({ reference, modifiedAt }) => !kept.has(reference) && modifiedAt < cutoff);
    for (const { reference } of orphans) await this.files.remove(reference);
    return ok(orphans.length);
  }
}

export class GetMediaPermission implements UseCase<MediaKind, MediaPermission> {
  constructor(private readonly permissions: MediaPermissionService) {}

  execute(kind: MediaKind): Promise<MediaPermission> {
    return this.permissions.getPermission(kind);
  }
}

export class RequestMediaPermission implements UseCase<MediaKind, MediaPermission> {
  constructor(private readonly permissions: MediaPermissionService) {}

  execute(kind: MediaKind): Promise<MediaPermission> {
    return this.permissions.requestPermission(kind);
  }
}

/**
 * Opens the library picker (up to `MAX_SELECTION` images) only while library access
 * is allowed (`granted` or `limited`); otherwise `forbidden` without opening it.
 * `null` when the traveller cancels.
 * The gate is deliberate: the task asks for explicit library-permission handling (denied, blocked,
 * Settings redirect), even though the iOS and Android 13+ system pickers could open without it.
 */
export class PickLibraryImages implements UseCase<void, Result<readonly PickedImage[] | null, AppError>> {
  constructor(
    private readonly picker: PhotoLibraryPicker,
    private readonly permissions: MediaPermissionService,
  ) {}

  async execute(): Promise<Result<readonly PickedImage[] | null, AppError>> {
    const permission = await this.permissions.getPermission('library');
    if (!allowsAccess(permission)) return err(new AppError('forbidden', `Photo library access is ${permission}`));
    return this.picker.pickImages({ selectionLimit: MAX_SELECTION });
  }
}
