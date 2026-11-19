import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { DestinationImage } from '@/features/discover/presentation/components/DestinationImage';
import { routes } from '@/shared/navigation/routes';
import { AppCard, AppText } from '@/shared/ui';

import { type LocalDate } from '../../domain/localDate';
import { type Trip } from '../../domain/Trip';
import { tripTimeline } from '../../domain/tripStatus';
import { formatTripDates, timelineLabel } from '../format';
import { TripStatusBadge } from './TripStatusBadge';

const THUMBNAIL_SIZE = 76;

interface TripCardProps {
  readonly trip: Trip;
  readonly today: LocalDate;
}

/** A trip in a list; opens its details. */
export function TripCard({ trip, today }: TripCardProps) {
  const { t, i18n } = useTranslation();
  const { spacing, radii } = useAppTheme();
  const { tripCoverStore } = useDependencies();
  const dates = formatTripDates(trip.startDate, trip.endDate, i18n.language);
  const timeline = timelineLabel(tripTimeline(trip, today), t);

  return (
    <AppCard
      padding="md"
      testID={`trip-card-${trip.id}`}
      accessibilityLabel={t('trips.cardLabel', {
        title: trip.title,
        destination: trip.destinationName,
        dates,
        status: timeline,
      })}
      onPress={() => router.push(routes.trip(trip.id))}
    >
      <View style={[styles.row, { gap: spacing.md }]}>
        <DestinationImage
          uri={trip.coverImage ? tripCoverStore.displayUri(trip.coverImage) : null}
          kind="place"
          style={[styles.thumbnail, { borderRadius: radii.md }]}
        />
        <View style={[styles.text, { gap: spacing.xxs }]}>
          <AppText variant="headline" numberOfLines={1}>
            {trip.title}
          </AppText>
          <AppText variant="callout" color="textSecondary" numberOfLines={1}>
            {trip.destinationName}
          </AppText>
          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            {dates}
          </AppText>
          <View style={[styles.status, { gap: spacing.sm, marginTop: spacing.xs }]}>
            <TripStatusBadge status={trip.status} />
            {trip.status === 'cancelled' ? null : (
              <AppText variant="caption" color="textSecondary" numberOfLines={1} style={styles.text}>
                {timeline}
              </AppText>
            )}
          </View>
        </View>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  thumbnail: { width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE },
  text: { flex: 1 },
  status: { flexDirection: 'row', alignItems: 'center' },
});
