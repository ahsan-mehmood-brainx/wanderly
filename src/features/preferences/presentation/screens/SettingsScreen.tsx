import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { LANGUAGE_NATIVE_NAMES, SUPPORTED_LANGUAGES } from '@/core/i18n/languages';
import { InlineMessage } from '@/shared/ui/InlineMessage';
import { OptionGroup, type Option } from '@/shared/ui/OptionGroup';
import { Screen } from '@/shared/ui/Screen';

import { THEME_PREFERENCES, type LanguagePreference, type ThemePreference } from '../../domain/Preferences';
import { usePreferenceSettings } from '../hooks/usePreferenceSettings';

export function SettingsScreen() {
  const { t } = useTranslation();
  const { theme, language, deviceLanguage, saveError, setTheme, setLanguage, dismissSaveError } =
    usePreferenceSettings();

  const themeOptions = useMemo<Option<ThemePreference>[]>(
    () =>
      THEME_PREFERENCES.map((value) => ({
        value,
        label: t(`settings.appearance.${value}`),
        description: value === 'system' ? t('settings.appearance.systemHint') : undefined,
      })),
    [t],
  );

  const languageOptions = useMemo<Option<LanguagePreference>[]>(
    () => [
      {
        value: 'system',
        label: t('settings.language.system'),
        description: t('settings.language.systemHint', { language: LANGUAGE_NATIVE_NAMES[deviceLanguage] }),
      },
      ...SUPPORTED_LANGUAGES.map((code) => ({ value: code, label: LANGUAGE_NATIVE_NAMES[code] })),
    ],
    [t, deviceLanguage],
  );

  return (
    <Screen>
      {saveError ? (
        <InlineMessage message={t('settings.saveError')} dismissLabel={t('common.dismiss')} onDismiss={dismissSaveError} />
      ) : null}
      <OptionGroup title={t('settings.appearance.title')} options={themeOptions} value={theme} onChange={setTheme} />
      <OptionGroup title={t('settings.language.title')} options={languageOptions} value={language} onChange={setLanguage} />
    </Screen>
  );
}
