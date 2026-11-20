import { useContext, useEffect, useLayoutEffect, type ReactNode } from 'react';
import { getI18n, I18nContext } from 'react-i18next';

import { useAppDispatch, useAppSelector } from '@/core/store/hooks';
import { ThemeProvider } from '@/core/theme/ThemeProvider';
import { applyNativeColorScheme } from '@/features/preferences/presentation/applyNativeColorScheme';
import { useResolvedPreferences } from '@/features/preferences/presentation/hooks/useResolvedPreferences';
import { loadPreferences } from '@/features/preferences/presentation/state/preferencesSlice';
import { selectPreferences, selectPreferencesReady } from '@/features/preferences/presentation/state/selectors';

import { getAppliedLanguage, setAppliedLanguage } from './appliedLanguage';

interface PreferencesGateProps {
  readonly children: ReactNode;
  /** Called once preferences are applied; used to hide the native splash screen. */
  readonly onReady?: () => void;
}

/**
 * Loads persisted preferences before rendering the app so the first frame is
 * already in the right theme and language (no flash), then keeps theme and
 * language in sync with preference and device changes.
 */
export function PreferencesGate({ children, onReady }: PreferencesGateProps) {
  const dispatch = useAppDispatch();
  const ready = useAppSelector(selectPreferencesReady);
  const { theme, language: languagePreference } = useAppSelector(selectPreferences);
  const { colorScheme, language } = useResolvedPreferences();
  // The instance itself: `useTranslation().i18n` is a wrapper whose identity changes with the language.
  const i18n = useContext(I18nContext)?.i18n ?? getI18n();

  useEffect(() => {
    void dispatch(loadPreferences());
  }, [dispatch]);

  // Layout effect: translations are bundled, so the switch completes before paint.
  // `createAppContainer` records the device language it started in, so any
  // difference (saved preference, or a device change since) is applied. An i18n
  // instance created with a fixed language and nothing recorded keeps that
  // language for "system" on first launch; later changes apply as usual.
  useLayoutEffect(() => {
    if (!ready) return;
    const applied = getAppliedLanguage(i18n);
    if (applied === undefined && languagePreference === 'system') {
      setAppliedLanguage(i18n, language);
      return;
    }
    if (applied === language) return;
    setAppliedLanguage(i18n, language);
    if (i18n.language !== language) void i18n.changeLanguage(language);
  }, [ready, language, languagePreference, i18n]);

  useEffect(() => {
    if (ready) applyNativeColorScheme(theme);
  }, [ready, theme]);

  useEffect(() => {
    if (ready) onReady?.();
  }, [ready, onReady]);

  if (!ready) return null;

  return <ThemeProvider scheme={colorScheme}>{children}</ThemeProvider>;
}
