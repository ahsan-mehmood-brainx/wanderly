import { useTranslation } from 'react-i18next';
import { FlatList } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppEmptyView, AppErrorView, AppLoader } from '@/shared/ui';

import { TripCard } from '../components/TripCard';
import { useTrips } from '../hooks/useTrips';

interface TripListScreenProps {
  readonly status: 'upcoming' | 'completed';
}

/** The Upcoming Trips and Completed Trips screens. */
export function TripListScreen({ status }: TripListScreenProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useAppTheme();
  const { loading, failed, errorKind, retry, groups, total, today } = useTrips();
  const trips = groups[status];

  if (total === 0 && loading) return <AppLoader fullScreen />;
  if (total === 0 && failed) return <AppErrorView fullScreen errorKind={errorKind ?? undefined} onRetry={retry} />;
  if (trips.length === 0) {
    return (
      <AppEmptyView
        fullScreen
        icon="luggage"
        title={t(`trips.${status}EmptyTitle`)}
        message={t(`trips.${status}EmptyMessage`)}
      />
    );
  }

  return (
    <FlatList
      data={trips}
      keyExtractor={(trip) => trip.id}
      renderItem={({ item }) => <TripCard trip={item} today={today} />}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      testID={`trip-list-${status}`}
    />
  );
}
