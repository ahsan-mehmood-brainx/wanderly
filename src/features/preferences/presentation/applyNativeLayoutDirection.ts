import { I18nManager, Platform } from 'react-native';

import { isRtlLanguage, type SupportedLanguage } from '@/core/i18n/languages';

export interface NativeLayoutDirectionResult {
  /** The native layout direction only changes after the app is restarted. */
  readonly restartRequired: boolean;
}

/**
 * Keeps native chrome (stack headers, tab order, back gesture) in line with the
 * language. React Native reads the flags at launch, so a change shows after a
 * restart. `allowRTL(false)` also keeps an LTR language LTR on an RTL device.
 */
export function applyNativeLayoutDirection(language: SupportedLanguage): NativeLayoutDirectionResult {
  if (Platform.OS === 'web') return { restartRequired: false };
  const rtl = isRtlLanguage(language);
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  return { restartRequired: I18nManager.isRTL !== rtl };
}
