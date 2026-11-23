import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';
import { type Clock } from '@/core/utils/Clock';
import { type ImagePickerService, type TripOwnerProvider } from '@/features/trips/domain/repositories';

import { type LocalProfile } from '../LocalProfile';
import { validateProfileInput, type LocalProfileInput, type ProfileValidationErrors } from '../profileValidation';
import { type LocalProfileRepository, type ProfilePhotoStore } from '../repositories';

export type SaveProfileOutcome =
  | { readonly status: 'saved'; readonly profile: LocalProfile }
  /** Nothing was saved; the form shows the errors inline. */
  | { readonly status: 'invalid'; readonly errors: ProfileValidationErrors }
  /** Nothing was saved (`storage`, `unauthorized` when signed out). */
  | { readonly status: 'failed'; readonly error: AppError };

const PROFILE_PHOTO_ASPECT = [1, 1] as const;

function requireOwner(owners: TripOwnerProvider): Result<string, AppError> {
  const ownerId = owners.currentOwnerId();
  return ownerId === null ? err(new AppError('unauthorized', 'No signed-in account for the profile')) : ok(ownerId);
}

/** The signed-in account's local profile. `unauthorized` when nobody is signed in. */
export class GetLocalProfile implements UseCase<void, Result<LocalProfile, AppError>> {
  constructor(
    private readonly repository: LocalProfileRepository,
    private readonly owners: TripOwnerProvider,
  ) {}

  async execute(): Promise<Result<LocalProfile, AppError>> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return owner;
    return this.repository.load(owner.value);
  }
}

/**
 * Validates and saves the signed-in account's local profile. A newly picked
 * photo is copied into app storage first; the replaced photo is deleted only
 * after the save succeeds.
 */
export class SaveLocalProfile implements UseCase<LocalProfileInput, SaveProfileOutcome> {
  constructor(
    private readonly repository: LocalProfileRepository,
    private readonly owners: TripOwnerProvider,
    private readonly photos: ProfilePhotoStore,
    private readonly clock: Clock,
  ) {}

  async execute(input: LocalProfileInput): Promise<SaveProfileOutcome> {
    const validation = validateProfileInput(input);
    if (!validation.ok) return { status: 'invalid', errors: validation.errors };
    const owner = requireOwner(this.owners);
    if (!owner.ok) return { status: 'failed', error: owner.error };

    const previous = await this.repository.load(owner.value);
    if (!previous.ok) return { status: 'failed', error: previous.error };
    const previousPhoto = previous.value.photo;

    const { draft } = validation;
    let photo = draft.photo;
    let imported: string | null = null;
    // The unchanged photo is kept as is (like trip covers), even if it isn't a reference this store recognises.
    if (photo !== null && photo !== previousPhoto && !this.photos.isStoredReference(photo)) {
      const copied = await this.photos.importImage(photo);
      if (!copied.ok) return { status: 'failed', error: copied.error };
      photo = imported = copied.value;
    }

    const profile: LocalProfile = { ...draft, photo, updatedAt: this.clock.now() };
    const saved = await this.repository.save(owner.value, profile);
    if (!saved.ok) {
      // The profile still points at the old photo; the copy would only be an orphan.
      if (imported !== null) await this.photos.remove(imported);
      return { status: 'failed', error: saved.error };
    }
    if (previousPhoto !== null && previousPhoto !== photo) await this.photos.remove(previousPhoto);
    return { status: 'saved', profile };
  }
}

/** Opens the photo library for a square photo. `null` when the traveller cancels. */
export class PickProfilePhoto implements UseCase<void, Result<string | null, AppError>> {
  constructor(private readonly picker: ImagePickerService) {}

  execute(): Promise<Result<string | null, AppError>> {
    return this.picker.pickImage({ aspect: PROFILE_PHOTO_ASPECT });
  }
}
