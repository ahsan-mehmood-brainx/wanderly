import { SUPPORTED_LANGUAGES } from '@/core/i18n/languages';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const LANGUAGE_PREFERENCES = ['system', ...SUPPORTED_LANGUAGES] as const;
export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number];

export interface Preferences {
  readonly theme: ThemePreference;
  readonly language: LanguagePreference;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  language: 'system',
};
