import { router } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { LANGUAGE_NATIVE_NAMES, SUPPORTED_LANGUAGES } from '@/core/i18n/languages';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppCard, AppIcon, AppText, InlineMessage, OptionGroup, Screen, type Option } from '@/shared/ui';

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
        <InlineMessage
          message={t('settings.saveError')}
          dismissLabel={t('common.dismiss')}
          onDismiss={dismissSaveError}
        />
      ) : null}
      <OptionGroup title={t('settings.appearance.title')} options={themeOptions} value={theme} onChange={setTheme} />
      <OptionGroup
        title={t('settings.language.title')}
        options={languageOptions}
        value={language}
        onChange={setLanguage}
      />
      {__DEV__ ? <DeveloperSection /> : null}
    </Screen>
  );
}

/** Dev-build-only tools. Stripped from production bundles by the `__DEV__` check. */
function DeveloperSection() {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <AppText
        variant="sectionTitle"
        color="textSecondary"
        accessibilityRole="header"
        style={{ paddingHorizontal: spacing.xs }}
      >
        {t('settings.developer.title')}
      </AppText>
      <AppCard
        variant="outlined"
        padding="lg"
        accessibilityLabel={t('settings.developer.designSystem')}
        onPress={() => router.push('/settings/design-system')}
      >
        <View style={[styles.row, { gap: spacing.md }]}>
          <AppIcon name="settings" size="md" color="primary" />
          <AppText style={styles.fill}>{t('settings.developer.designSystem')}</AppText>
          <AppIcon name="chevronRight" size="sm" color="textTertiary" />
        </View>
      </AppCard>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  fill: { flex: 1 },
});
