import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { type AppErrorKind } from '@/core/errors/AppError';
import { getErrorMessageKey } from '@/core/errors/errorMessages';
import { useAppDispatch } from '@/core/store/hooks';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { buildDirectionsUrls } from '@/features/map/domain/directions';
import { ConfirmSheet } from '@/features/trips/presentation/components/ConfirmSheet';
import { routes } from '@/shared/navigation/routes';
import { openExternalUrl } from '@/shared/navigation/openExternalUrl';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyView,
  AppIcon,
  type AppIconName,
  AppText,
  InlineMessage,
  Screen,
} from '@/shared/ui';

import { type Activity } from '../../domain/Activity';
import { dayNumberOf } from '../../domain/itinerary';
import { findTimeConflicts } from '../../domain/timeConflicts';
import { ItineraryStateView } from '../components/ItineraryStateView';
import { CATEGORY_ICONS, formatActivityTime, formatCost, formatDayLabel } from '../format';
import { useActivity } from '../hooks/useItinerary';
import { deleteActivity, setActivityCompleted } from '../state/itinerarySlice';

interface ActivityDetailsScreenProps {
  /** Both validated by the route. */
  readonly tripId: string;
  readonly activityId: string;
}

/** One activity, and the deep-link target for `/trips/:tripId/itinerary/:itemId`. */
export function ActivityDetailsScreen({ tripId, activityId }: ActivityDetailsScreenProps) {
  const { t } = useTranslation();
  const { screen, trip, activity, dayActivities, retry } = useActivity(tripId, activityId);
  // Set once deletion starts: the activity leaves the store before the screen has gone back.
  const [deleting, setDeleting] = useState(false);

  if (screen.kind !== 'ready' || !trip) {
    return <ItineraryStateView state={screen.kind === 'ready' ? { kind: 'loading' } : screen} onRetry={retry} />;
  }
  if (activity) {
    return (
      <ActivityDetails
        activity={activity}
        dayNumber={dayNumberOf(trip, activity.date)}
        dayActivities={dayActivities}
        onDeletingChange={setDeleting}
      />
    );
  }
  if (deleting) return null;
  return (
    <AppEmptyView
      fullScreen
      icon="calendar"
      title={t('itinerary.notFoundTitle')}
      message={t('itinerary.notFoundMessage')}
      actionLabel={t('itinerary.backToItinerary')}
      onAction={() => router.navigate(routes.itinerary(tripId))}
      testID="activity-not-found"
    />
  );
}

interface ActivityDetailsProps {
  readonly activity: Activity;
  readonly dayNumber: number | null;
  readonly dayActivities: readonly Activity[];
  readonly onDeletingChange: (deleting: boolean) => void;
}

function ActivityDetails({ activity, dayNumber, dayActivities, onDeletingChange }: ActivityDetailsProps) {
  const { t, i18n } = useTranslation();
  const { spacing } = useAppTheme();
  const dispatch = useAppDispatch();
  const { logger } = useDependencies();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [notice, setNotice] = useState<AppErrorKind | null>(null);
  const [mapsFailed, setMapsFailed] = useState(false);
  const openingMaps = useRef(false);
  const language = i18n.language;

  const overlapTitles = useMemo(() => {
    const ids = findTimeConflicts(dayActivities).get(activity.id) ?? [];
    return dayActivities.filter((item) => ids.includes(item.id)).map(({ title }) => title);
  }, [activity.id, dayActivities]);

  const toggleCompleted = async () => {
    setNotice(null);
    const action = await dispatch(setActivityCompleted({ id: activity.id, completed: !activity.isCompleted }));
    if (setActivityCompleted.rejected.match(action)) {
      if (!action.meta.condition) setNotice('unknown');
    } else if (action.payload.status === 'failed') {
      setNotice(action.payload.errorKind);
    }
  };

  const confirmDelete = async () => {
    setConfirmingDelete(false);
    setNotice(null);
    onDeletingChange(true);
    const action = await dispatch(deleteActivity(activity.id));
    if (deleteActivity.fulfilled.match(action) && action.payload.status === 'deleted') {
      if (router.canGoBack()) router.back();
      else router.replace(routes.itineraryDay(activity.tripId, activity.date));
      return;
    }
    onDeletingChange(false);
    if (deleteActivity.fulfilled.match(action) && action.payload.status === 'failed') {
      setNotice(action.payload.errorKind);
    } else if (deleteActivity.rejected.match(action) && !action.meta.condition) {
      setNotice('unknown');
    }
  };

  const openInMaps = async (latitude: number, longitude: number) => {
    if (openingMaps.current) return;
    openingMaps.current = true;
    setMapsFailed(false);
    try {
      for (const url of buildDirectionsUrls({ latitude, longitude }, activity.title, Platform.OS)) {
        if (await openExternalUrl(url, logger)) return;
      }
      setMapsFailed(true);
    } finally {
      openingMaps.current = false;
    }
  };

  const { latitude, longitude } = activity;

  return (
    <Screen>
      <View testID="activity-details" style={{ gap: spacing.lg }}>
        <View style={{ gap: spacing.sm }}>
          <View style={[styles.row, { gap: spacing.sm }]}>
            <AppIcon name={CATEGORY_ICONS[activity.category]} size="lg" color="primary" />
            <AppText variant="title" accessibilityRole="header" style={styles.fill}>
              {activity.title}
            </AppText>
          </View>
          <View style={[styles.wrap, { gap: spacing.sm }]}>
            <AppBadge label={t(`itinerary.categories.${activity.category}`)} tone="primary" />
            {activity.isCompleted ? (
              <AppBadge label={t('itinerary.details.completed')} tone="success" icon="check" />
            ) : null}
          </View>
        </View>

        {overlapTitles.length > 0 ? (
          <InlineMessage
            tone="warning"
            icon="warning"
            message={t('itinerary.overlapsWith', { titles: overlapTitles.join(', ') })}
          />
        ) : null}

        {notice ? (
          <InlineMessage
            message={t(getErrorMessageKey(notice))}
            dismissLabel={t('common.dismiss')}
            onDismiss={() => setNotice(null)}
          />
        ) : null}

        <AppCard variant="outlined">
          <View style={{ gap: spacing.lg }}>
            <Fact
              icon="calendar"
              label={t('itinerary.details.day')}
              value={formatDayLabel(activity.date, dayNumber, language, t)}
            />
            <Fact icon="clock" label={t('itinerary.details.time')} value={formatActivityTime(activity, language, t)} />
            {activity.address ? (
              <Fact icon="location" label={t('itinerary.details.address')} value={activity.address} />
            ) : null}
            {activity.estimatedCost !== null ? (
              <Fact
                icon="wallet"
                label={t('itinerary.details.cost')}
                value={formatCost(activity.estimatedCost, activity.currency, language)}
              />
            ) : null}
            {activity.notes ? <Fact icon="info" label={t('itinerary.details.notes')} value={activity.notes} /> : null}
            {activity.description ? (
              <Fact icon="info" label={t('itinerary.details.description')} value={activity.description} />
            ) : null}
          </View>
        </AppCard>
      </View>

      {latitude !== null && longitude !== null ? (
        <View style={{ gap: spacing.sm }}>
          <AppButton
            label={t('itinerary.details.openInMaps')}
            variant="outline"
            leftIcon="directions"
            fullWidth
            onPress={() => void openInMaps(latitude, longitude)}
          />
          {mapsFailed ? <InlineMessage message={t('itinerary.details.openInMapsFailed')} /> : null}
        </View>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <AppButton
          label={activity.isCompleted ? t('itinerary.details.markNotDone') : t('itinerary.details.markDone')}
          leftIcon={activity.isCompleted ? 'restore' : 'check'}
          fullWidth
          onPress={() => void toggleCompleted()}
        />
        <AppButton
          label={t('itinerary.details.edit')}
          variant="outline"
          leftIcon="edit"
          fullWidth
          onPress={() => router.push(routes.editActivity(activity.tripId, activity.id))}
        />
        <AppButton
          label={t('itinerary.details.delete')}
          variant="ghost"
          leftIcon="trash"
          fullWidth
          onPress={() => setConfirmingDelete(true)}
        />
      </View>

      <ConfirmSheet
        visible={confirmingDelete}
        title={t('itinerary.details.deleteTitle')}
        message={t('itinerary.details.deleteMessage', { title: activity.title })}
        confirmLabel={t('itinerary.details.deleteConfirm')}
        cancelLabel={t('itinerary.details.keep')}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmingDelete(false)}
        testID="delete-activity-sheet"
      />
    </Screen>
  );
}

function Fact({ icon, label, value }: { readonly icon: AppIconName; readonly label: string; readonly value: string }) {
  const { spacing } = useAppTheme();
  return (
    <View style={[styles.fact, { gap: spacing.md }]} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppIcon name={icon} size="md" color="primary" />
      <View style={[styles.fill, { gap: spacing.xxs }]}>
        <AppText variant="caption" color="textSecondary">
          {label}
        </AppText>
        <AppText>{value}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  fact: { flexDirection: 'row', alignItems: 'flex-start' },
});
