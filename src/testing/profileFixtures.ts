import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';
import { EMPTY_LOCAL_PROFILE, type LocalProfile } from '@/features/profile/domain/LocalProfile';
import { type LocalProfileInput } from '@/features/profile/domain/profileValidation';
import { type ProfilePhotoStore } from '@/features/profile/domain/repositories';

export function localProfile(overrides: Partial<LocalProfile> = {}): LocalProfile {
  return { ...EMPTY_LOCAL_PROFILE, ...overrides };
}

export function localProfileInput(overrides: Partial<LocalProfileInput> = {}): LocalProfileInput {
  return { displayName: 'Emily', homeBase: '', bio: '', photo: null, ...overrides };
}

/** In-memory {@link ProfilePhotoStore}: imports become `profile-photos/photo-N.jpg`. */
export class FakeProfilePhotoStore implements ProfilePhotoStore {
  readonly supported: boolean = true;
  readonly stored = new Set<string>();
  readonly removed: string[] = [];
  failImports = false;
  private next = 0;

  async importImage(sourceUri: string): Promise<Result<string, AppError>> {
    if (this.failImports) return err(new AppError('storage', `Could not copy ${sourceUri}`));
    const reference = `profile-photos/photo-${++this.next}.jpg`;
    this.stored.add(reference);
    return ok(reference);
  }

  isStoredReference(value: string): boolean {
    return value.startsWith('profile-photos/');
  }

  async remove(reference: string): Promise<void> {
    this.removed.push(reference);
    this.stored.delete(reference);
  }

  displayUri(reference: string): string {
    return `file:///documents/${reference}`;
  }
}
