import { Appearance, Platform } from 'react-native';

import { type ThemePreference } from '../domain/Preferences';

/**
 * Keeps native UI (alerts, keyboards, date pickers, tab bar) in sync with the
 * in-app theme. 'auto' removes the override and follows the OS again.
 */
export function applyNativeColorScheme(preference: ThemePreference): void {
  if (Platform.OS === 'web') return;
  Appearance.setColorScheme(preference === 'system' ? 'auto' : preference);
}
