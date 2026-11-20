import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';

import { type LocalProfile } from './LocalProfile';

/**
 * The local profile, one per account. Every operation takes the owner and only
 * ever sees that owner's profile. Failures are `storage` errors.
 */
export interface LocalProfileRepository {
  /** The owner's profile, or the empty profile when nothing was saved. */
  load(ownerId: string): Promise<Result<LocalProfile, AppError>>;
  save(ownerId: string, profile: LocalProfile): Promise<Result<void, AppError>>;
}

/**
 * Profile photos kept in app storage. A picked photo is a temporary file, so it
 * is copied in before the profile referencing it is saved.
 */
export interface ProfilePhotoStore {
  /** False where the platform can't keep photos (web): the form hides the photo picker. */
  readonly supported: boolean;
  /** Copies a picked image into app storage and returns the reference to save with the profile. */
  importImage(sourceUri: string): Promise<Result<string, AppError>>;
  /** True when `value` is a reference this store returned (as opposed to a newly picked image URI). */
  isStoredReference(value: string): boolean;
  /** Deletes a stored image. Best effort: a failure is logged, never surfaced. */
  remove(reference: string): Promise<void>;
  /** A URI an `<Image>` can show, or `null` if the reference can't be resolved. */
  displayUri(reference: string): string | null;
}
