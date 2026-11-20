import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { type AppErrorKind } from '@/core/errors/AppError';
import { getErrorMessageKey } from '@/core/errors/errorMessages';
import { useAppDispatch } from '@/core/store/hooks';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { BudgetEntryCard } from '@/features/budget/presentation/components/BudgetEntryCard';
import { DestinationImage } from '@/features/discover/presentation/components/DestinationImage';
import { ItineraryEntryCard } from '@/features/itinerary/presentation/components/ItineraryEntryCard';
import { DeviceWeatherCard } from '@/features/weather/presentation/components/DeviceWeather';
import { useDeviceWeather } from '@/features/weather/presentation/hooks/useDeviceWeather';
import { routes } from '@/shared/navigation/routes';
import {
  AppButton,
  AppCard,
  AppEmptyView,
  AppErrorView,
  AppIcon,
  type AppIconName,
  AppLoader,
  AppText,
  InlineMessage,
  Screen,
} from '@/shared/ui';

import { isCustomDestination, type Trip } from '../../domain/Trip';
import { tripLengthDays, tripTimeline } from '../../domain/tripStatus';
import { type TripConflict } from '../../domain/tripValidation';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { TripStatusBadge } from '../components/TripStatusBadge';
import { formatBudget, formatTripDates, timelineLabel } from '../format';
import { useTrip } from '../hooks/useTrips';
import { deleteTrip, setTripCancelled } from '../state/tripsSlice';

interface TripScreenProps {
  /** Already validated by the route. */
  readonly tripId: string;
}

type Notice =
  | { readonly kind: 'failed'; readonly errorKind: AppErrorKind }
  | { readonly kind: 'restoreBlocked'; readonly conflict: TripConflict };

/** Trip details, and the deep-link target for `/trips/:tripId`. */
export function TripScreen({ tripId }: TripScreenProps) {
  const { t } = useTranslation();
  const { trip, today, loading, failed, errorKind, retry } = useTrip(tripId);
  // Set once deletion starts: the trip leaves the store before the screen has gone back.
  const [deleting, setDeleting] = useState(false);

  if (trip) return <TripDetails trip={trip} today={today} onDeletingChange={setDeleting} />;
  if (deleting) return null;
  if (loading) return <AppLoader fullScreen />;
  if (failed) return <AppErrorView fullScreen errorKind={errorKind ?? undefined} onRetry={retry} />;
  return (
    <AppEmptyView
      fullScreen
      icon="luggage"
      title={t('trips.notFoundTitle')}
      message={t('trips.notFoundMessage')}
      actionLabel={t('trips.backToTrips')}
      onAction={() => router.navigate(routes.trips)}
      testID="trip-not-found"
    />
  );
}

interface TripDetailsProps {
  readonly trip: Trip;
  readonly today: string;
  readonly onDeletingChange: (deleting: boolean) => void;
}

function TripDetails({ trip, today, onDeletingChange }: TripDetailsProps) {
  const { t, i18n } = useTranslation();
  const { spacing, radii } = useAppTheme();
  const dispatch = useAppDispatch();
  const { tripCoverStore } = useDependencies();
  const weather = useDeviceWeather();
  const [confirming, setConfirming] = useState<'delete' | 'cancel' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const language = i18n.language;
  const cancelled = trip.status === 'cancelled';
  const coverUri = trip.coverImage ? tripCoverStore.displayUri(trip.coverImage) : null;

  const changeCancelled = async (next: boolean) => {
    setConfirming(null);
    setNotice(null);
    const action = await dispatch(setTripCancelled({ id: trip.id, cancelled: next }));
    if (setTripCancelled.rejected.match(action)) {
      if (!action.meta.condition) setNotice({ kind: 'failed', errorKind: 'unknown' });
      return;
    }
    const outcome = action.payload;
    if (outcome.status === 'failed') setNotice({ kind: 'failed', errorKind: outcome.errorKind });
    else if (outcome.status === 'invalid') {
      setNotice(
        outcome.errors.conflict
          ? { kind: 'restoreBlocked', conflict: outcome.errors.conflict }
          : { kind: 'failed', errorKind: 'unknown' },
      );
    }
  };

  const confirmDelete = async () => {
    setConfirming(null);
    setNotice(null);
    onDeletingChange(true);
    const action = await dispatch(deleteTrip(trip.id));
    if (deleteTrip.fulfilled.match(action) && action.payload.status === 'deleted') {
      if (router.canGoBack()) router.back();
      else router.replace(routes.trips);
      return;
    }
    onDeletingChange(false);
    if (deleteTrip.fulfilled.match(action) && action.payload.status === 'failed') {
      setNotice({ kind: 'failed', errorKind: action.payload.errorKind });
    } else if (deleteTrip.rejected.match(action) && !action.meta.condition) {
      setNotice({ kind: 'failed', errorKind: 'unknown' });
    }
  };

  return (
    <Screen>
      <View testID="trip-screen" style={{ gap: spacing.lg }}>
        {coverUri ? (
          <DestinationImage
            uri={coverUri}
            kind="place"
            accessibilityLabel={t('trips.details.coverAlt', { title: trip.title })}
            style={[styles.cover, { borderRadius: radii.lg }]}
          />
        ) : null}
        <View style={{ gap: spacing.sm }}>
          <AppText variant="title" accessibilityRole="header">
            {trip.title}
          </AppText>
          <View style={[styles.statusRow, { gap: spacing.sm }]}>
            <TripStatusBadge status={trip.status} />
            {cancelled ? null : (
              <AppText variant="callout" color="textSecondary">
                {timelineLabel(tripTimeline(trip, today), t)}
              </AppText>
            )}
          </View>
        </View>
      </View>

      {notice ? (
        <InlineMessage
          message={
            notice.kind === 'failed'
              ? t(getErrorMessageKey(notice.errorKind))
              : t('trips.details.restoreBlocked', {
                  title: notice.conflict.title,
                  dates: formatTripDates(notice.conflict.startDate, notice.conflict.endDate, language),
                })
          }
          dismissLabel={t('common.dismiss')}
          onDismiss={() => setNotice(null)}
        />
      ) : null}

      <AppCard variant="outlined">
        <View style={{ gap: spacing.lg }}>
          <Fact icon="location" label={t('trips.details.destination')} value={trip.destinationName} />
          <Fact
            icon="calendar"
            label={t('trips.details.dates')}
            value={`${formatTripDates(trip.startDate, trip.endDate, language)} · ${t('trips.durationDays', { count: tripLengthDays(trip) })}`}
          />
          <Fact
            icon="wallet"
            label={t('trips.details.budget')}
            value={formatBudget(trip.budget, trip.currency, language)}
          />
          {trip.description ? (
            <Fact icon="info" label={t('trips.details.description')} value={trip.description} />
          ) : null}
        </View>
      </AppCard>

      <ItineraryEntryCard tripId={trip.id} />
      <BudgetEntryCard tripId={trip.id} />

      {isCustomDestination(trip.destinationId) ? null : (
        <AppButton
          label={t('trips.details.viewDestination')}
          variant="outline"
          leftIcon="explore"
          fullWidth
          onPress={() => router.push(routes.destination(trip.destinationId))}
        />
      )}

      <DeviceWeatherCard
        state={weather}
        onOpenForecast={
          weather.status === 'located' && weather.weather.status === 'ready'
            ? () => router.push(routes.tripWeather(trip.id))
            : undefined
        }
      />

      <View style={{ gap: spacing.sm }}>
        <AppButton
          label={t('trips.details.edit')}
          leftIcon="edit"
          fullWidth
          onPress={() => router.push(routes.editTrip(trip.id))}
        />
        {cancelled ? (
          <AppButton
            label={t('trips.details.restore')}
            variant="outline"
            leftIcon="restore"
            fullWidth
            onPress={() => void changeCancelled(false)}
          />
        ) : (
          <AppButton
            label={t('trips.details.cancel')}
            variant="outline"
            leftIcon="close"
            fullWidth
            onPress={() => setConfirming('cancel')}
          />
        )}
        <AppButton
          label={t('trips.details.delete')}
          variant="ghost"
          leftIcon="trash"
          fullWidth
          onPress={() => setConfirming('delete')}
        />
      </View>

      <ConfirmSheet
        visible={confirming === 'cancel'}
        title={t('trips.details.cancelTitle')}
        message={t('trips.details.cancelMessage', { title: trip.title })}
        confirmLabel={t('trips.details.cancelConfirm')}
        cancelLabel={t('trips.details.keepTrip')}
        onConfirm={() => void changeCancelled(true)}
        onCancel={() => setConfirming(null)}
        testID="cancel-trip-sheet"
      />
      <ConfirmSheet
        visible={confirming === 'delete'}
        title={t('trips.details.deleteTitle')}
        message={t('trips.details.deleteMessage', { title: trip.title })}
        confirmLabel={t('trips.details.deleteConfirm')}
        cancelLabel={t('trips.details.keepTrip')}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirming(null)}
        testID="delete-trip-sheet"
      />
    </Screen>
  );
}

function Fact({ icon, label, value }: { readonly icon: AppIconName; readonly label: string; readonly value: string }) {
  const { spacing } = useAppTheme();
  return (
    <View style={[styles.fact, { gap: spacing.md }]} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppIcon name={icon} size="md" color="primary" />
      <View style={[styles.factText, { gap: spacing.xxs }]}>
        <AppText variant="caption" color="textSecondary">
          {label}
        </AppText>
        <AppText>{value}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { width: '100%', aspectRatio: 16 / 9 },
  statusRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  fact: { flexDirection: 'row', alignItems: 'flex-start' },
  factText: { flex: 1 },
});
