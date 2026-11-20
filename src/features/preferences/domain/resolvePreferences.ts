import { FALLBACK_LANGUAGE, isSupportedLanguage, type SupportedLanguage } from '@/core/i18n/languages';
import { type ColorScheme } from '@/core/theme/types';
import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES } from '@/core/money/currencies';

import { type CurrencyPreference, type LanguagePreference, type ThemePreference } from './Preferences';

/** Turns the user's theme choice into the scheme to render, following the OS when set to "system". */
export function resolveColorScheme(preference: ThemePreference, systemScheme: string | null | undefined): ColorScheme {
  if (preference !== 'system') return preference;
  return systemScheme === 'dark' ? 'dark' : 'light';
}

/**
 * Picks the language to render. For "system", walks the device's preferred
 * languages in order and uses the first one the app supports.
 */
export function resolveLanguage(
  preference: LanguagePreference,
  deviceLanguageCodes: readonly (string | null | undefined)[],
): SupportedLanguage {
  if (preference !== 'system') return preference;
  const match = deviceLanguageCodes.map((code) => code?.toLowerCase()).find(isSupportedLanguage);
  return match ?? FALLBACK_LANGUAGE;
}

/**
 * The currency a new trip starts in. For "system", the device region's currency
 * when trips support it, else the default trip currency.
 */
export function resolveCurrency(preference: CurrencyPreference, regionCurrencyCode: string | null | undefined): string {
  if (preference !== 'system') return preference;
  const region = SUPPORTED_CURRENCIES.find((code) => code === regionCurrencyCode);
  return region ?? DEFAULT_CURRENCY;
}
