import { useEffect, useLayoutEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useAppDispatch, useAppSelector } from '@/core/store/hooks';
import { ThemeProvider } from '@/core/theme/ThemeProvider';
import { applyNativeColorScheme } from '@/features/preferences/presentation/applyNativeColorScheme';
import { useResolvedPreferences } from '@/features/preferences/presentation/hooks/useResolvedPreferences';
import { loadPreferences } from '@/features/preferences/presentation/state/preferencesSlice';
import { selectPreferences, selectPreferencesReady } from '@/features/preferences/presentation/state/selectors';

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
  const { theme } = useAppSelector(selectPreferences);
  const { colorScheme, language } = useResolvedPreferences();
  const { i18n } = useTranslation();

  useEffect(() => {
    void dispatch(loadPreferences());
  }, [dispatch]);

  // Layout effect: translations are bundled, so the switch completes before paint.
  useLayoutEffect(() => {
    if (ready && i18n.language !== language) void i18n.changeLanguage(language);
  }, [ready, language, i18n]);

  useEffect(() => {
    if (ready) applyNativeColorScheme(theme);
  }, [ready, theme]);

  useEffect(() => {
    if (ready) onReady?.();
  }, [ready, onReady]);

  if (!ready) return null;

  return <ThemeProvider scheme={colorScheme}>{children}</ThemeProvider>;
}
