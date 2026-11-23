import { useLocales } from 'expo-localization';
import { useCallback, useMemo } from 'react';

import { type AppErrorKind } from '@/core/errors/AppError';
import { type SupportedLanguage } from '@/core/i18n/languages';
import { useAppDispatch, useAppSelector } from '@/core/store/hooks';

import {
  type CurrencyPreference,
  type LanguagePreference,
  type NotificationPreference,
  type NotificationPreferences,
  type ThemePreference,
} from '../../domain/Preferences';
import { resolveCurrency } from '../../domain/resolvePreferences';
import { saveErrorDismissed, updatePreferences } from '../state/preferencesSlice';
import { selectLayoutRestartRequired, selectPreferences, selectPreferencesSaveError } from '../state/selectors';
import { useResolvedPreferences } from './useResolvedPreferences';

export interface PreferenceSettings {
  readonly theme: ThemePreference;
  readonly language: LanguagePreference;
  readonly deviceLanguage: SupportedLanguage;
  readonly currency: CurrencyPreference;
  /** What "Device region" currently resolves to, for display in Settings. */
  readonly deviceCurrency: string;
  readonly notifications: NotificationPreferences;
  /** The native layout direction changes only after a restart. */
  readonly layoutRestartRequired: boolean;
  readonly saveError: AppErrorKind | null;
  readonly setTheme: (theme: ThemePreference) => void;
  readonly setLanguage: (language: LanguagePreference) => void;
  readonly setCurrency: (currency: CurrencyPreference) => void;
  readonly setNotification: (key: NotificationPreference, enabled: boolean) => void;
  readonly dismissSaveError: () => void;
}

/** View-model for the Settings screen: state plus intent callbacks, no rendering concerns. */
export function usePreferenceSettings(): PreferenceSettings {
  const dispatch = useAppDispatch();
  const { theme, language, currency, notifications } = useAppSelector(selectPreferences);
  const saveError = useAppSelector(selectPreferencesSaveError);
  const layoutRestartRequired = useAppSelector(selectLayoutRestartRequired);
  const { deviceLanguage } = useResolvedPreferences();
  const deviceCurrencyCode = useLocales()[0]?.currencyCode;
  const deviceCurrency = useMemo(() => resolveCurrency('system', deviceCurrencyCode), [deviceCurrencyCode]);

  const setTheme = useCallback(
    (value: ThemePreference) => void dispatch(updatePreferences({ theme: value })),
    [dispatch],
  );
  const setLanguage = useCallback(
    (value: LanguagePreference) => void dispatch(updatePreferences({ language: value })),
    [dispatch],
  );
  const setCurrency = useCallback(
    (value: CurrencyPreference) => void dispatch(updatePreferences({ currency: value })),
    [dispatch],
  );
  // Only the switch that changed: in-memory values may be start-up defaults and
  // must not overwrite the other switch in storage.
  const setNotification = useCallback(
    (key: NotificationPreference, enabled: boolean) =>
      void dispatch(updatePreferences({ notifications: { [key]: enabled } })),
    [dispatch],
  );
  const dismissSaveError = useCallback(() => dispatch(saveErrorDismissed()), [dispatch]);

  return {
    theme,
    language,
    deviceLanguage,
    currency,
    deviceCurrency,
    notifications,
    layoutRestartRequired,
    saveError,
    setTheme,
    setLanguage,
    setCurrency,
    setNotification,
    dismissSaveError,
  };
}
