import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { routes } from '@/shared/navigation/routes';
import { AppCard, AppIcon, AppText } from '@/shared/ui';

import { useItinerary } from '../hooks/useItinerary';
import { ProgressSummary } from './ProgressCard';

/** The way into a trip's itinerary from its details, with completion progress. */
export function ItineraryEntryCard({ tripId }: { readonly tripId: string }) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const { progress } = useItinerary(tripId);
  const summary = t('itinerary.progress', { completed: progress.completed, total: progress.total });

  return (
    <AppCard
      variant="outlined"
      onPress={() => router.push(routes.itinerary(tripId))}
      accessibilityLabel={t('itinerary.entryLabel', { progress: summary })}
      accessibilityHint={t('itinerary.entryHint')}
      testID="trip-itinerary-entry"
    >
      <View style={[styles.header, { gap: spacing.sm }]}>
        <AppIcon name="calendar" size="md" color="primary" />
        <AppText variant="headline" style={styles.fill}>
          {t('itinerary.entryTitle')}
        </AppText>
        <AppIcon name="chevronRight" size="sm" color="textSecondary" />
      </View>
      <ProgressSummary progress={progress} />
    </AppCard>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  fill: { flex: 1 },
});
