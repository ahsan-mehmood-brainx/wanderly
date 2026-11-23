import { useDependencies } from '@/core/di/DependenciesProvider';
import { useAppSelector } from '@/core/store/hooks';
import { displayName, type AuthUser } from '@/features/auth/domain/AuthUser';
import { selectCurrentUser } from '@/features/auth/presentation/state/selectors';

import { useLocalProfile } from './useLocalProfile';

export interface ProfileIdentity {
  readonly user: AuthUser;
  /** The local display name when set, else the account name. */
  readonly name: string;
  /** The local photo when set, else the account photo; `undefined` shows initials. */
  readonly imageUri: string | undefined;
}

/**
 * Who is signed in, as the traveller chose to be shown: the account (owned by
 * auth) overlaid with the local profile. `null` while nobody is signed in.
 */
export function useProfileIdentity(): ProfileIdentity | null {
  const { profilePhotoStore } = useDependencies();
  const user = useAppSelector(selectCurrentUser);
  const { profile } = useLocalProfile();
  if (!user) return null;

  const localPhoto = profile.photo ? profilePhotoStore.displayUri(profile.photo) : null;
  return {
    user,
    name: profile.displayName ?? displayName(user),
    imageUri: localPhoto ?? user.imageUrl ?? undefined,
  };
}
