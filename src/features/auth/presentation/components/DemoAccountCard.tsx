import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppBadge, AppButton, AppCard, AppText } from '@/shared/ui';

import { DEMO_CREDENTIALS } from '../../domain/DemoAccount';

interface DemoAccountCardProps {
  readonly onUse: () => void;
}

/** States plainly that sign-in uses DummyJSON demo accounts, and fills them in on request. */
export function DemoAccountCard({ onUse }: DemoAccountCardProps) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();

  return (
    <AppCard variant="filled" padding="lg" testID="demo-account-card">
      <View style={[styles.header, { gap: spacing.sm }]}>
        <AppText variant="headline" accessibilityRole="header" style={styles.title}>
          {t('auth.demo.title')}
        </AppText>
        <AppBadge label={t('auth.demo.badge')} tone="info" size="sm" icon="sparkles" />
      </View>
      <AppText variant="callout" color="textSecondary">
        {t('auth.demo.body', { ...DEMO_CREDENTIALS })}
      </AppText>
      <AppButton label={t('auth.demo.useDemo')} variant="outline" size="sm" leftIcon="person" onPress={onUse} />
    </AppCard>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1 },
});
