import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppCard, AppIcon, AppText, Screen } from '@/shared/ui';

import appConfig from '../../../../../app.json';

/**
 * The app version from the running manifest. The manifest is missing where no
 * update or dev server supplied one, so the bundled app config is the fallback.
 */
const APP_VERSION = Constants.expoConfig?.version ?? appConfig.expo.version;

/** App name, version and data attribution. */
export function AboutScreen() {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const version = APP_VERSION;

  return (
    <Screen>
      <View style={[styles.identity, { gap: spacing.sm }]}>
        <AppIcon name="globe" size="xxl" color="primary" />
        <AppText variant="title" accessibilityRole="header" align="center">
          {t('common.appName')}
        </AppText>
        {version ? (
          <AppText color="textSecondary" align="center">
            {t('about.version', { version })}
          </AppText>
        ) : null}
        <AppText align="center">{t('about.tagline')}</AppText>
      </View>
      <View style={{ gap: spacing.sm }}>
        <AppText variant="sectionTitle" color="textSecondary" accessibilityRole="header">
          {t('about.attributionTitle')}
        </AppText>
        <AppCard variant="outlined" padding="lg">
          <AppText variant="callout">{t('about.attribution')}</AppText>
        </AppCard>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { alignItems: 'center' },
});
