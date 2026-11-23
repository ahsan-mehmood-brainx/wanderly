import { SUPPORTED_LANGUAGES } from '@/core/i18n/languages';
import { SUPPORTED_CURRENCIES } from '@/core/money/currencies';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const LANGUAGE_PREFERENCES = ['system', ...SUPPORTED_LANGUAGES] as const;
export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number];

/** 'system' follows the device region; otherwise an ISO 4217 code the app offers. */
export const CURRENCY_PREFERENCES = ['system', ...SUPPORTED_CURRENCIES] as const;
export type CurrencyPreference = (typeof CURRENCY_PREFERENCES)[number];

export interface NotificationPreferences {
  readonly tripReminders: boolean;
  readonly budgetAlerts: boolean;
}

export type NotificationPreference = keyof NotificationPreferences;

export interface Preferences {
  readonly theme: ThemePreference;
  readonly language: LanguagePreference;
  readonly currency: CurrencyPreference;
  readonly notifications: NotificationPreferences;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  language: 'system',
  currency: 'system',
  notifications: { tripReminders: false, budgetAlerts: false },
};

/**
 * A preference change: any top-level field, and only the notification switches
 * that changed, so one switch never carries a stale value for the other.
 */
export type PreferenceChanges = Partial<Omit<Preferences, 'notifications'>> & {
  readonly notifications?: Partial<NotificationPreferences>;
};

/** Applies a change on top of `current`, merging notification switches one by one. */
export function applyPreferenceChanges(current: Preferences, changes: PreferenceChanges): Preferences {
  const { notifications, ...rest } = changes;
  return { ...current, ...rest, notifications: { ...current.notifications, ...notifications } };
}
