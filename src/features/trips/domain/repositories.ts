import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';

import { type LocalDate } from './localDate';
import { type StoredTrip } from './Trip';

/** Who trips currently belong to: the signed-in account, or `null` when nobody is signed in. */
export interface TripOwnerProvider {
  currentOwnerId(): string | null;
}

/**
 * Trips saved on the device, kept separately per account. Every operation takes
 * the owner and only ever sees that owner's trips: another account's trip behaves
 * as if it didn't exist. Every operation works offline. Failures are `storage`
 * errors; `update`/`delete` of a missing trip are `notFound`.
 */
export interface TripRepository {
  /** All of the owner's trips, ordered by start date. */
  list(ownerId: string): Promise<Result<readonly StoredTrip[], AppError>>;
  findById(ownerId: string, id: string): Promise<Result<StoredTrip | null, AppError>>;
  /**
   * The owner's trips that aren't cancelled and overlap the range under the
   * product rule (`tripsOverlap`), excluding `excludeId`. Ordered by start date.
   */
  findOverlapping(
    ownerId: string,
    range: { readonly startDate: LocalDate; readonly endDate: LocalDate },
    excludeId: string | null,
  ): Promise<Result<readonly StoredTrip[], AppError>>;
  insert(ownerId: string, trip: StoredTrip): Promise<Result<void, AppError>>;
  update(ownerId: string, trip: StoredTrip): Promise<Result<void, AppError>>;
  delete(ownerId: string, id: string): Promise<Result<void, AppError>>;
}

/**
 * Cover photos kept in app storage. A photo picker hands out temporary files
 * that the system may clear, so a chosen photo is copied in before the trip
 * referencing it is saved.
 */
export interface TripCoverStore {
  /** False where the platform can't keep photos (web): the form hides the cover field. */
  readonly supported: boolean;
  /** Copies a picked image into app storage and returns the reference to save with the trip. */
  importImage(sourceUri: string): Promise<Result<string, AppError>>;
  /** True when `value` is a reference this store returned (as opposed to a newly picked image URI). */
  isStoredReference(value: string): boolean;
  /** Deletes a stored image. Best effort: a failure is logged, never surfaced (the trip change already happened). */
  remove(reference: string): Promise<void>;
  /** A URI an `<Image>` can show, or `null` if the reference can't be resolved. */
  displayUri(reference: string): string | null;
}

export interface PickImageOptions {
  /** Crop aspect ratio; trip covers use the default 16:9. */
  readonly aspect?: readonly [number, number];
}

/** Lets the traveller pick a photo. `null` when they cancel. */
export interface ImagePickerService {
  pickImage(options?: PickImageOptions): Promise<Result<string | null, AppError>>;
}
