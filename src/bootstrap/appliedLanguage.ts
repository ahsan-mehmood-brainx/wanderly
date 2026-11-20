import { type i18n } from 'i18next';

import { type SupportedLanguage } from '@/core/i18n/languages';

/**
 * The resolved language (device language for "system") last applied to each i18n
 * instance. Kept per instance rather than per component, so a remounted
 * `PreferencesGate` still applies a change that happened while it was unmounted.
 */
const appliedLanguages = new WeakMap<i18n, SupportedLanguage>();

/** `undefined` when nothing was recorded: the instance was created with a fixed language. */
export function getAppliedLanguage(instance: i18n): SupportedLanguage | undefined {
  return appliedLanguages.get(instance);
}

export function setAppliedLanguage(instance: i18n, language: SupportedLanguage): void {
  appliedLanguages.set(instance, language);
}
