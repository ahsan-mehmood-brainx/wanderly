import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';

import { type Photo, type PickedImage } from './Photo';

/**
 * Photo metadata saved on the device, kept separately per account like trips. Every
 * operation takes the owner and only sees that owner's photos. Failures are
 * `storage` errors; deleting a missing photo is `notFound`. Deleting a trip or an
 * activity deletes its photos.
 */
export interface PhotoRepository {
  /** All of the trip's photos (its activities' included), newest first. */
  listByTrip(ownerId: string, tripId: string): Promise<Result<readonly Photo[], AppError>>;
  /** The activity's photos, newest first. */
  listByActivity(ownerId: string, activityId: string): Promise<Result<readonly Photo[], AppError>>;
  findById(ownerId: string, id: string): Promise<Result<Photo | null, AppError>>;
  countByTrip(ownerId: string, tripId: string): Promise<Result<number, AppError>>;
  /** Inserts every photo in one transaction; nothing is saved if one fails. */
  insertMany(ownerId: string, photos: readonly Photo[]): Promise<Result<void, AppError>>;
  delete(ownerId: string, id: string): Promise<Result<void, AppError>>;
  /** Every stored reference, for every account: what file cleanup must keep. */
  allReferences(): Promise<Result<readonly string[], AppError>>;
}

export interface StoredPhotoFile {
  readonly reference: string;
  /** Epoch ms. */
  readonly modifiedAt: number;
}

/** Photo files kept in app storage, referenced relatively (`trip-photos/<name>`). */
export interface PhotoFileStore {
  /** False where the platform can't keep photos (web). */
  readonly supported: boolean;
  /** Copies an image into app storage and returns the reference to save. */
  importImage(sourceUri: string): Promise<Result<string, AppError>>;
  isStoredReference(value: string): boolean;
  /** Deletes a stored photo. Best effort: a failure is logged, never surfaced. */
  remove(reference: string): Promise<void>;
  /** A URI an `<Image>` can show, or `null` if the reference can't be resolved. */
  displayUri(reference: string): string | null;
  /** False when the reference is invalid or its file is gone. */
  exists(reference: string): boolean;
  /** Every file in the photo folder. */
  listStored(): Promise<Result<readonly StoredPhotoFile[], AppError>>;
}

export interface ProcessImageOptions {
  readonly maxEdge: number;
  readonly quality: number;
}

export interface ImageSource {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
}

export interface ProcessedImage {
  /** A temporary file; discard it once imported. */
  readonly uri: string;
  readonly width: number;
  readonly height: number;
  readonly fileSize: number;
}

/** Resizes and re-encodes an image as JPEG. */
export interface ImageProcessor {
  process(source: ImageSource, options: ProcessImageOptions): Promise<Result<ProcessedImage, AppError>>;
  /** Deletes a processed temporary file. Best effort. */
  discard(uri: string): Promise<void>;
}

export type MediaKind = 'camera' | 'library';

/** `limited` is iOS access to selected photos only, which still allows picking. */
export type MediaPermission = 'granted' | 'limited' | 'undetermined' | 'denied' | 'blocked';

export interface MediaPermissionService {
  getPermission(kind: MediaKind): Promise<MediaPermission>;
  /** Shows the system prompt when it can still be shown; otherwise returns the current permission. */
  requestPermission(kind: MediaKind): Promise<MediaPermission>;
}

export interface PickImagesOptions {
  readonly selectionLimit: number;
}

/** The system photo library, several images at once. `null` when the traveller cancels. */
export interface PhotoLibraryPicker {
  pickImages(options: PickImagesOptions): Promise<Result<readonly PickedImage[] | null, AppError>>;
}
