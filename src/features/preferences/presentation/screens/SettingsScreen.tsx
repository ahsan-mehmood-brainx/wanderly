import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { LANGUAGE_NATIVE_NAMES, SUPPORTED_LANGUAGES } from '@/core/i18n/languages';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useSignOut } from '@/features/auth/presentation/hooks/useSignOut';
import { routes } from '@/shared/navigation/routes';
import {
  AppButton,
  AppCard,
  AppDivider,
  AppIcon,
  AppText,
  InlineMessage,
  ListGroup,
  ListNavRow,
  OptionGroup,
  Screen,
  type Option,
} from '@/shared/ui';

import { THEME_PREFERENCES, type LanguagePreference, type ThemePreference } from '../../domain/Preferences';
import { CurrencyPreferenceSheet } from '../components/CurrencyPreferenceSheet';
import { SettingSwitchRow } from '../components/SettingSwitchRow';
import { useLocationPermissionSetting } from '../hooks/useLocationPermissionSetting';
import { usePreferenceSettings } from '../hooks/usePreferenceSettings';

export function SettingsScreen() {
  const { t } = useTranslation();
  const settings = usePreferenceSettings();
  const { theme, language, deviceLanguage, currency, deviceCurrency, notifications } = settings;
  const { confirmSignOut, pending: signOutPending } = useSignOut();
  const [currencySheetOpen, setCurrencySheetOpen] = useState(false);

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
      {settings.saveError ? (
        <InlineMessage
          message={t('settings.saveError')}
          dismissLabel={t('common.dismiss')}
          onDismiss={settings.dismissSaveError}
        />
      ) : null}
      {settings.layoutRestartRequired ? (
        <InlineMessage tone="info" icon="info" message={t('settings.layoutRestart')} />
      ) : null}
      <OptionGroup
        title={t('settings.appearance.title')}
        options={themeOptions}
        value={theme}
        onChange={settings.setTheme}
      />
      <OptionGroup
        title={t('settings.language.title')}
        options={languageOptions}
        value={language}
        onChange={settings.setLanguage}
      />

      <Section title={t('settings.currency.title')} caption={t('settings.currency.hint')}>
        <ListGroup>
          <ListNavRow
            icon="currency"
            label={t('settings.currency.title')}
            value={currency === 'system' ? t('settings.currency.systemValue', { currency: deviceCurrency }) : currency}
            onPress={() => setCurrencySheetOpen(true)}
          />
        </ListGroup>
      </Section>

      <Section title={t('settings.notifications.title')} caption={t('settings.notifications.notSentYet')}>
        <ListGroup>
          <SettingSwitchRow
            icon="calendar"
            label={t('settings.notifications.tripReminders')}
            value={notifications.tripReminders}
            onChange={(enabled) => settings.setNotification('tripReminders', enabled)}
          />
          <AppDivider inset="xxxl" />
          <SettingSwitchRow
            icon="wallet"
            label={t('settings.notifications.budgetAlerts')}
            value={notifications.budgetAlerts}
            onChange={(enabled) => settings.setNotification('budgetAlerts', enabled)}
          />
        </ListGroup>
      </Section>

      <Section title={t('settings.location.title')} caption={t('settings.location.hint')}>
        <ListGroup>
          <LocationAccessRow />
        </ListGroup>
      </Section>

      <Section title={t('settings.info.title')}>
        <ListGroup>
          <ListNavRow icon="lock" label={t('settings.info.privacy')} onPress={() => router.push(routes.privacy)} />
          <AppDivider inset="xxxl" />
          <ListNavRow icon="info" label={t('settings.info.about')} onPress={() => router.push(routes.about)} />
        </ListGroup>
      </Section>

      <Section title={t('settings.account.title')}>
        <AppButton
          label={t('auth.profile.signOut')}
          variant="outline"
          leftIcon="logout"
          fullWidth
          loading={signOutPending}
          onPress={confirmSignOut}
        />
      </Section>

      {__DEV__ ? <DeveloperSection /> : null}

      <CurrencyPreferenceSheet
        visible={currencySheetOpen}
        value={currency}
        deviceCurrency={deviceCurrency}
        onClose={() => setCurrencySheetOpen(false)}
        onSelect={(value) => {
          settings.setCurrency(value);
          setCurrencySheetOpen(false);
        }}
      />
    </Screen>
  );
}

function Section({ title, caption, children }: { title: string; caption?: string; children: ReactNode }) {
  const { spacing } = useAppTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText
        variant="sectionTitle"
        color="textSecondary"
        accessibilityRole="header"
        style={{ paddingHorizontal: spacing.xs }}
      >
        {title}
      </AppText>
      {children}
      {caption ? (
        <AppText variant="caption" color="textSecondary" style={{ paddingHorizontal: spacing.xs }}>
          {caption}
        </AppText>
      ) : null}
    </View>
  );
}

/** The OS permission, with the one action that can change it from here. */
function LocationAccessRow() {
  const { t } = useTranslation();
  const { spacing, sizes } = useAppTheme();
  const { permission, requesting, request, openSettings } = useLocationPermissionSetting();
  const status = permission === null ? t('settings.location.checking') : t(`settings.location.${permission}`);

  return (
    <View style={[styles.row, { minHeight: sizes.touchTarget, padding: spacing.lg, gap: spacing.md }]}>
      <AppIcon name="location" size="md" color="primary" />
      <View accessible style={styles.fill}>
        <AppText variant="caption" color="textSecondary">
          {t('settings.location.access')}
        </AppText>
        <AppText>{status}</AppText>
      </View>
      {permission === 'undetermined' || permission === 'denied' ? (
        <AppButton label={t('settings.location.allow')} size="sm" loading={requesting} onPress={request} />
      ) : null}
      {/* Once granted (or blocked) only the system settings can change it, so that is the way out. */}
      {permission === 'blocked' || permission === 'granted' ? (
        <AppButton label={t('settings.location.openSettings')} size="sm" variant="outline" onPress={openSettings} />
      ) : null}
    </View>
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
        onPress={() => router.push(routes.designSystem)}
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
