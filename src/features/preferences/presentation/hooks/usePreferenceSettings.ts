import { useCallback } from 'react';

import { type AppErrorKind } from '@/core/errors/AppError';
import { type SupportedLanguage } from '@/core/i18n/languages';
import { useAppDispatch, useAppSelector } from '@/core/store/hooks';

import { type LanguagePreference, type ThemePreference } from '../../domain/Preferences';
import { saveErrorDismissed, updatePreferences } from '../state/preferencesSlice';
import { selectPreferences, selectPreferencesSaveError } from '../state/selectors';
import { useResolvedPreferences } from './useResolvedPreferences';

export interface PreferenceSettings {
  readonly theme: ThemePreference;
  readonly language: LanguagePreference;
  readonly deviceLanguage: SupportedLanguage;
  readonly saveError: AppErrorKind | null;
  readonly setTheme: (theme: ThemePreference) => void;
  readonly setLanguage: (language: LanguagePreference) => void;
  readonly dismissSaveError: () => void;
}

/** View-model for the Settings screen: state plus intent callbacks, no rendering concerns. */
export function usePreferenceSettings(): PreferenceSettings {
  const dispatch = useAppDispatch();
  const { theme, language } = useAppSelector(selectPreferences);
  const saveError = useAppSelector(selectPreferencesSaveError);
  const { deviceLanguage } = useResolvedPreferences();

  const setTheme = useCallback(
    (value: ThemePreference) => void dispatch(updatePreferences({ theme: value })),
    [dispatch],
  );
  const setLanguage = useCallback(
    (value: LanguagePreference) => void dispatch(updatePreferences({ language: value })),
    [dispatch],
  );
  const dismissSaveError = useCallback(() => dispatch(saveErrorDismissed()), [dispatch]);

  return { theme, language, deviceLanguage, saveError, setTheme, setLanguage, dismissSaveError };
}
