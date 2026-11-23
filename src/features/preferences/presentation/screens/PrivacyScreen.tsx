import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppCard, AppText, Screen } from '@/shared/ui';

const SERVICES = [
  'dummyJson',
  'restCountries',
  'wikipedia',
  'openMeteo',
  'platformMaps',
  'openStreetMap',
  'frankfurter',
] as const;

/** What Wanderly stores and which third-party services it calls. Static copy; keep it in line with the app. */
export function PrivacyScreen() {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();

  return (
    <Screen>
      <AppText color="textSecondary">{t('privacy.intro')}</AppText>
      <PrivacySection title={t('privacy.device.title')}>
        <AppText>{t('privacy.device.body')}</AppText>
      </PrivacySection>
      <PrivacySection title={t('privacy.location.title')}>
        <AppText>{t('privacy.location.body')}</AppText>
      </PrivacySection>
      <PrivacySection title={t('privacy.services.title')}>
        <View style={{ gap: spacing.sm }}>
          {SERVICES.map((service) => (
            <AppText key={service}>{t(`privacy.services.${service}`)}</AppText>
          ))}
        </View>
      </PrivacySection>
    </Screen>
  );
}

function PrivacySection({ title, children }: { title: string; children: ReactNode }) {
  const { spacing } = useAppTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="sectionTitle" color="textSecondary" accessibilityRole="header">
        {title}
      </AppText>
      <AppCard variant="outlined" padding="lg">
        {children}
      </AppCard>
    </View>
  );
}
