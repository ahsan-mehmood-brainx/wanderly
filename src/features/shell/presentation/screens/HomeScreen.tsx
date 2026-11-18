import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAppSelector } from '@/core/store/hooks';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { selectCurrentUser } from '@/features/auth/presentation/state/selectors';
import { routes } from '@/shared/navigation/routes';
import { AppCard, AppIcon, AppText, Screen, type AppIconName } from '@/shared/ui';

interface QuickAction {
  readonly id: 'explore' | 'trips' | 'budget' | 'savedPlaces';
  readonly icon: AppIconName;
  readonly href: Href;
}

const QUICK_ACTIONS: readonly QuickAction[] = [
  { id: 'explore', icon: 'explore', href: routes.explore },
  { id: 'trips', icon: 'luggage', href: routes.trips },
  { id: 'budget', icon: 'wallet', href: routes.budget },
  { id: 'savedPlaces', icon: 'bookmark', href: routes.savedPlaces },
];

export function HomeScreen() {
  const { t } = useTranslation();
  const { colors, spacing, radii } = useAppTheme();
  const user = useAppSelector(selectCurrentUser);
  const name = user?.firstName || user?.username || '';

  return (
    <Screen>
      <View style={{ gap: spacing.sm }}>
        <AppText variant="largeTitle" accessibilityRole="header">
          {t('home.greeting', { name })}
        </AppText>
        <AppText color="textSecondary">{t('home.subtitle')}</AppText>
      </View>

      <View style={{ gap: spacing.md }}>
        <AppText variant="sectionTitle" color="textSecondary" accessibilityRole="header">
          {t('home.quickActions')}
        </AppText>
        <View style={[styles.grid, { gap: spacing.md }]}>
          {QUICK_ACTIONS.map((action) => (
            <AppCard
              key={action.id}
              variant="elevated"
              padding="lg"
              accessibilityLabel={t(`navigation.${action.id}`)}
              accessibilityHint={t(`home.actions.${action.id}`)}
              onPress={() => router.navigate(action.href)}
              style={styles.tile}
            >
              <View style={[styles.badge, { backgroundColor: colors.primaryMuted, borderRadius: radii.md }]}>
                <AppIcon name={action.icon} size="md" color="primary" />
              </View>
              <AppText variant="headline">{t(`navigation.${action.id}`)}</AppText>
              <AppText variant="caption" color="textSecondary">
                {t(`home.actions.${action.id}`)}
              </AppText>
            </AppCard>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const BADGE_SIZE = 40;

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  // Two columns on phones; the screen's max width keeps tiles sensible on tablets.
  tile: { flexGrow: 1, flexBasis: '40%' },
  badge: { width: BADGE_SIZE, height: BADGE_SIZE, alignItems: 'center', justifyContent: 'center' },
});
