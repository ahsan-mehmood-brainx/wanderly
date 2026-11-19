import { type Href, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { Section } from '@/features/discover/presentation/components/Section';
import { routes } from '@/shared/navigation/routes';
import { AppEmptyView, AppErrorView, AppLoader, Screen } from '@/shared/ui';

import { type LocalDate } from '../../domain/localDate';
import { type Trip } from '../../domain/Trip';
import { TripCard } from '../components/TripCard';
import { useTrips } from '../hooks/useTrips';

/** Long groups show this many trips here; "See all" opens the full list. */
const PREVIEW_COUNT = 3;

/** My Trips: every trip, grouped by status. */
export function TripsScreen() {
  const { t } = useTranslation();
  const { loading, failed, errorKind, retry, groups, total, today } = useTrips();

  if (total === 0) {
    if (loading) return <AppLoader fullScreen />;
    if (failed) return <AppErrorView fullScreen errorKind={errorKind ?? undefined} onRetry={retry} />;
    return (
      <AppEmptyView
        fullScreen
        icon="luggage"
        title={t('trips.emptyTitle')}
        message={t('trips.emptyMessage')}
        actionLabel={t('trips.planTrip')}
        onAction={() => router.push(routes.newTrip)}
      />
    );
  }

  return (
    <Screen>
      <TripSection title={t('trips.status.ongoing')} trips={groups.ongoing} today={today} testID="trips-ongoing" />
      <TripSection
        title={t('trips.status.upcoming')}
        trips={groups.upcoming}
        today={today}
        seeAll={routes.upcomingTrips}
        testID="trips-upcoming"
      />
      <TripSection
        title={t('trips.status.completed')}
        trips={groups.completed}
        today={today}
        seeAll={routes.completedTrips}
        testID="trips-completed"
      />
      <TripSection
        title={t('trips.status.cancelled')}
        trips={groups.cancelled}
        today={today}
        testID="trips-cancelled"
      />
    </Screen>
  );
}

interface TripSectionProps {
  readonly title: string;
  readonly trips: readonly Trip[];
  readonly today: LocalDate;
  /** Full list for this group; only these groups are shortened. */
  readonly seeAll?: Href;
  readonly testID: string;
}

function TripSection({ title, trips, today, seeAll, testID }: TripSectionProps) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  if (trips.length === 0) return null;
  const shown = seeAll ? trips.slice(0, PREVIEW_COUNT) : trips;

  return (
    <Section
      title={title}
      testID={testID}
      action={
        seeAll && trips.length > PREVIEW_COUNT
          ? {
              label: t('trips.seeAll'),
              accessibilityLabel: t('trips.seeAllLabel', { section: title }),
              onPress: () => router.push(seeAll),
            }
          : undefined
      }
    >
      <View style={{ gap: spacing.md }}>
        {shown.map((trip) => (
          <TripCard key={trip.id} trip={trip} today={today} />
        ))}
      </View>
    </Section>
  );
}
