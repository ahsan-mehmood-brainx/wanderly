import { useLocales } from 'expo-localization';
import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { type SupportedLanguage } from '@/core/i18n/languages';
import { useAppSelector } from '@/core/store/hooks';
import { type ColorScheme } from '@/core/theme/types';

import { resolveColorScheme, resolveLanguage } from '../../domain/resolvePreferences';
import { selectPreferences } from '../state/selectors';

export interface ResolvedPreferences {
  readonly colorScheme: ColorScheme;
  readonly language: SupportedLanguage;
  /** What "system" currently resolves to, for display in Settings. */
  readonly deviceLanguage: SupportedLanguage;
}

/** Combines stored preferences with live device settings (scheme, locales). */
export function useResolvedPreferences(): ResolvedPreferences {
  const { theme, language } = useAppSelector(selectPreferences);
  const systemScheme = useColorScheme();
  const locales = useLocales();

  return useMemo(() => {
    const deviceLanguageCodes = locales.map((locale) => locale.languageCode);
    return {
      colorScheme: resolveColorScheme(theme, systemScheme),
      language: resolveLanguage(language, deviceLanguageCodes),
      deviceLanguage: resolveLanguage('system', deviceLanguageCodes),
    };
  }, [theme, language, systemScheme, locales]);
}
