/**
 * What the traveller keeps about themselves on this device, per account. It is
 * separate from the account (email, username) that authentication owns.
 */
export interface LocalProfile {
  /** Shown instead of the account name when set. */
  readonly displayName: string | null;
  readonly homeBase: string | null;
  readonly bio: string | null;
  /** Reference returned by `ProfilePhotoStore` (not a display URI), or `null`. */
  readonly photo: string | null;
  /** Epoch ms of the last save; `null` when nothing was saved yet. */
  readonly updatedAt: number | null;
}

export const EMPTY_LOCAL_PROFILE: LocalProfile = {
  displayName: null,
  homeBase: null,
  bio: null,
  photo: null,
  updatedAt: null,
};

export const PROFILE_LIMITS = {
  displayNameMaxLength: 60,
  homeBaseMaxLength: 80,
  bioMaxLength: 160,
} as const;
