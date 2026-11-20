import { useCallback, useMemo, useRef, useState } from 'react';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { type AppErrorKind } from '@/core/errors/AppError';
import { useAppDispatch, useAppSelector } from '@/core/store/hooks';

import { type LocalProfile } from '../../domain/LocalProfile';
import {
  type LocalProfileInput,
  type ProfileField,
  type ProfileValidationErrors,
} from '../../domain/profileValidation';
import { saveLocalProfile } from '../state/profileSlice';
import { selectLocalProfileSaving } from '../state/selectors';

/** The form's values: the name field always holds text, even while it shows the account name. */
type ProfileFormInput = Omit<LocalProfileInput, 'displayName'> & { readonly displayName: string };

function inputFrom(profile: LocalProfile, accountName: string): ProfileFormInput {
  return {
    displayName: profile.displayName ?? accountName,
    homeBase: profile.homeBase ?? '',
    bio: profile.bio ?? '',
    photo: profile.photo,
  };
}

/**
 * The form values to save. While no display name was saved, a name left equal to
 * the account name is saved as `null`, so the profile keeps following the account
 * name (a later change on the server still shows) instead of freezing a copy of it.
 */
function toSave(input: ProfileFormInput, profile: LocalProfile, accountName: string): LocalProfileInput {
  const followsAccount = profile.displayName === null && input.displayName.trim() === accountName.trim();
  return followsAccount ? { ...input, displayName: null } : input;
}

/**
 * View model for Edit profile. `profile` is the saved local profile and
 * `accountName` the account's own name, which the form starts with when no
 * display name was saved.
 */
export function useProfileForm(profile: LocalProfile, accountName: string) {
  const dispatch = useAppDispatch();
  const { pickProfilePhoto, profilePhotoStore } = useDependencies();
  const saving = useAppSelector(selectLocalProfileSaving);

  const [initial] = useState(() => inputFrom(profile, accountName));
  const [input, setInput] = useState<ProfileFormInput>(initial);
  const [errors, setErrors] = useState<ProfileValidationErrors | null>(null);
  const [failure, setFailure] = useState<AppErrorKind | null>(null);
  const [photoPickFailed, setPhotoPickFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const picking = useRef(false);

  const change = useCallback(<K extends keyof ProfileFormInput>(key: K, value: ProfileFormInput[K]) => {
    setInput((current) => ({ ...current, [key]: value }));
    if (key === 'photo') return;
    const field = key as ProfileField;
    setErrors((current) => {
      if (!current?.fields[field]) return current;
      const { [field]: _cleared, ...fields } = current.fields;
      return { fields };
    });
  }, []);

  const pickPhoto = useCallback(async () => {
    if (picking.current) return;
    picking.current = true;
    setPhotoPickFailed(false);
    const picked = await pickProfilePhoto.execute();
    picking.current = false;
    if (!picked.ok) setPhotoPickFailed(true);
    else if (picked.value) change('photo', picked.value);
  }, [change, pickProfilePhoto]);

  const submit = useCallback(async () => {
    setFailure(null);
    const action = await dispatch(saveLocalProfile(toSave(input, profile, accountName)));
    if (saveLocalProfile.rejected.match(action)) {
      if (!action.meta.condition) setFailure('unknown');
      return;
    }
    const outcome = action.payload;
    switch (outcome.status) {
      case 'saved':
        setErrors(null);
        setSaved(true);
        break;
      case 'invalid':
        setErrors(outcome.errors);
        break;
      case 'failed':
        setFailure(outcome.errorKind);
        break;
    }
  }, [accountName, dispatch, input, profile]);

  const photoUri = useMemo(() => {
    if (!input.photo) return null;
    return profilePhotoStore.isStoredReference(input.photo) ? profilePhotoStore.displayUri(input.photo) : input.photo;
  }, [input.photo, profilePhotoStore]);

  return {
    input,
    errors,
    failure,
    photoPickFailed,
    photoUri,
    photoSupported: profilePhotoStore.supported,
    saving,
    saved,
    /** Unsaved edits exist (leaving asks first). */
    dirty: !saved && JSON.stringify(input) !== JSON.stringify(initial),
    setDisplayName: (value: string) => change('displayName', value),
    setHomeBase: (value: string) => change('homeBase', value),
    setBio: (value: string) => change('bio', value),
    pickPhoto,
    removePhoto: () => change('photo', null),
    submit,
  };
}
