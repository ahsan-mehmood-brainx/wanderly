import { createInstance, type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { FALLBACK_LANGUAGE, SUPPORTED_LANGUAGES, type SupportedLanguage } from './languages';
import { en } from './locales/en';
import { es } from './locales/es';

/**
 * Creates an isolated, synchronously initialised i18next instance.
 * Translations are bundled, so no network or async loading is involved.
 */
export function createI18n(language: SupportedLanguage): i18n {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    lng: language,
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  return instance;
}
