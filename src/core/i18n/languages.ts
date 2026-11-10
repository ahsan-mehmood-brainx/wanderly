/** Languages the app ships translations for. Keep in sync with `locales/` and the expo-localization plugin in app.json. */
export const SUPPORTED_LANGUAGES = ['en', 'es'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const FALLBACK_LANGUAGE: SupportedLanguage = 'en';

/** Endonyms: each language is shown in its own language, regardless of the active locale. */
export const LANGUAGE_NATIVE_NAMES: Readonly<Record<SupportedLanguage, string>> = {
  en: 'English',
  es: 'Español',
};

export function isSupportedLanguage(code: string | null | undefined): code is SupportedLanguage {
  return SUPPORTED_LANGUAGES.some((language) => language === code);
}
