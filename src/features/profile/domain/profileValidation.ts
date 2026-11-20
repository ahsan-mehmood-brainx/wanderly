import { PROFILE_LIMITS } from './LocalProfile';

export type ProfileField = 'displayName' | 'homeBase' | 'bio';

export type ProfileFieldError = 'required' | 'tooLong';

export interface ProfileValidationErrors {
  readonly fields: Partial<Record<ProfileField, ProfileFieldError>>;
}

/** What the traveller entered in the edit form, before validation (raw, untrimmed text). */
export interface LocalProfileInput {
  /** `null` keeps following the account name; an empty string is a missing name. */
  readonly displayName: string | null;
  readonly homeBase: string;
  readonly bio: string;
  /** A stored photo reference (unchanged), a newly picked image URI, or `null` for none. */
  readonly photo: string | null;
}

/** A validated {@link LocalProfileInput}: trimmed text, empty optional fields as `null`. */
export interface LocalProfileDraft {
  readonly displayName: string | null;
  readonly homeBase: string | null;
  readonly bio: string | null;
  readonly photo: string | null;
}

export type ProfileValidation =
  | { readonly ok: true; readonly draft: LocalProfileDraft }
  | { readonly ok: false; readonly errors: ProfileValidationErrors };

/** Length in characters (code points), so Urdu and emoji count as the reader sees them. */
function characterCount(text: string): number {
  return [...text].length;
}

export function validateProfileInput(input: LocalProfileInput): ProfileValidation {
  const displayName = input.displayName?.trim() ?? null;
  const homeBase = input.homeBase.trim();
  const bio = input.bio.trim();
  const fields: Partial<Record<ProfileField, ProfileFieldError>> = {};

  // `null` follows the account name, so there is nothing to check.
  if (displayName === '') fields.displayName = 'required';
  else if (displayName !== null && characterCount(displayName) > PROFILE_LIMITS.displayNameMaxLength) {
    fields.displayName = 'tooLong';
  }
  if (characterCount(homeBase) > PROFILE_LIMITS.homeBaseMaxLength) fields.homeBase = 'tooLong';
  if (characterCount(bio) > PROFILE_LIMITS.bioMaxLength) fields.bio = 'tooLong';

  if (Object.keys(fields).length > 0) return { ok: false, errors: { fields } };
  return {
    ok: true,
    draft: { displayName, homeBase: homeBase || null, bio: bio || null, photo: input.photo },
  };
}
