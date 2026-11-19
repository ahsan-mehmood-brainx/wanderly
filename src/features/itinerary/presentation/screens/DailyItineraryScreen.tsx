import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { type AppErrorKind } from '@/core/errors/AppError';
import { getErrorMessageKey } from '@/core/errors/errorMessages';
import { useAppDispatch, useAppSelector } from '@/core/store/hooks';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { type LocalDate } from '@/features/trips/domain/localDate';
import { routes } from '@/shared/navigation/routes';
import { AppButton, AppEmptyView, AppIconButton, AppText, InlineMessage } from '@/shared/ui';

import { type Activity } from '../../domain/Activity';
import { progress as progressOf } from '../../domain/itinerary';
import { findTimeConflicts } from '../../domain/timeConflicts';
import { ItineraryStateView } from '../components/ItineraryStateView';
import { ProgressSummary } from '../components/ProgressCard';
import { ReorderableActivityList } from '../components/ReorderableActivityList';
import { formatDayLabel } from '../format';
import { useItineraryDay } from '../hooks/useItinerary';
import { moveItem } from '../reorder';
import { reorderActivities, setActivityCompleted } from '../state/itinerarySlice';
import { selectItinerarySaving } from '../state/selectors';

interface DailyItineraryScreenProps {
  /** Both validated by the route. */
  readonly tripId: string;
  readonly date: LocalDate;
}

/** One day's timeline: reorderable activities with times, durations, conflicts and completion. */
export function DailyItineraryScreen({ tripId, date }: DailyItineraryScreenProps) {
  const day = useItineraryDay(tripId, date);
  if (day.screen.kind !== 'ready' || !day.trip) {
    return (
      <ItineraryStateView state={day.screen.kind === 'ready' ? { kind: 'loading' } : day.screen} onRetry={day.retry} />
    );
  }
  return <DayTimeline key={date} tripId={tripId} date={date} day={day} />;
}

interface DayTimelineProps {
  readonly tripId: string;
  readonly date: LocalDate;
  readonly day: ReturnType<typeof useItineraryDay>;
}

function DayTimeline({ tripId, date, day }: DayTimelineProps) {
  const { t, i18n } = useTranslation();
  const { colors, spacing, sizes } = useAppTheme();
  const dispatch = useAppDispatch();
  const saving = useAppSelector(selectItinerarySaving);
  // The order shown while a reorder is being saved; dropped when it is saved or fails.
  const [pendingOrder, setPendingOrder] = useState<readonly string[] | null>(null);
  const [notice, setNotice] = useState<AppErrorKind | null>(null);
  const [dragging, setDragging] = useState(false);

  const activities = useMemo(() => {
    if (!pendingOrder) return day.activities;
    const byId = new Map(day.activities.map((item) => [item.id, item]));
    const ordered = pendingOrder.flatMap((id) => byId.get(id) ?? []);
    return ordered.length === day.activities.length ? ordered : day.activities;
  }, [day.activities, pendingOrder]);
  const conflicts = useMemo(() => findTimeConflicts(activities), [activities]);
  const dayProgress = useMemo(() => progressOf(activities), [activities]);

  const reorder = async (from: number, to: number) => {
    const orderedIds = moveItem(
      activities.map(({ id }) => id),
      from,
      to,
    );
    setNotice(null);
    setPendingOrder(orderedIds);
    const action = await dispatch(reorderActivities({ tripId, date, orderedIds }));
    setPendingOrder(null);
    if (reorderActivities.rejected.match(action)) {
      if (!action.meta.condition) setNotice('unknown');
    } else if (action.payload.status === 'failed') {
      setNotice(action.payload.errorKind);
    }
  };

  const toggleCompleted = async (activity: Activity) => {
    setNotice(null);
    const action = await dispatch(setActivityCompleted({ id: activity.id, completed: !activity.isCompleted }));
    if (setActivityCompleted.rejected.match(action)) {
      if (!action.meta.condition) setNotice('unknown');
    } else if (action.payload.status === 'failed') {
      setNotice(action.payload.errorKind);
    }
  };

  const byId = new Map(activities.map((item) => [item.id, item]));
  const openDay = (other: LocalDate) => router.replace(routes.itineraryDay(tripId, other));
  const addActivity = () => router.push(routes.newActivity(tripId, date));

  return (
    <ScrollView
      testID="daily-itinerary"
      scrollEnabled={!dragging}
      contentInsetAdjustmentBehavior="automatic"
      style={[styles.fill, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { maxWidth: sizes.maxContentWidth, padding: spacing.lg, gap: spacing.lg },
      ]}
    >
      <View style={[styles.header, { gap: spacing.sm }]}>
        <AppIconButton
          icon="chevronLeft"
          accessibilityLabel={t('itinerary.previousDay')}
          disabled={day.previousDay === null}
          onPress={() => day.previousDay && openDay(day.previousDay)}
        />
        <AppText variant="subtitle" accessibilityRole="header" align="center" style={styles.fill}>
          {formatDayLabel(date, day.dayNumber, i18n.language, t)}
        </AppText>
        <AppIconButton
          icon="chevronRight"
          accessibilityLabel={t('itinerary.nextDay')}
          disabled={day.nextDay === null}
          onPress={() => day.nextDay && openDay(day.nextDay)}
        />
      </View>

      {day.insideTrip ? null : <InlineMessage tone="warning" icon="warning" message={t('itinerary.outsideDay')} />}

      {notice ? (
        <InlineMessage
          message={t(getErrorMessageKey(notice))}
          dismissLabel={t('common.dismiss')}
          onDismiss={() => setNotice(null)}
        />
      ) : null}

      {activities.length === 0 ? (
        <AppEmptyView
          icon="calendar"
          title={t('itinerary.emptyDay')}
          message={t('itinerary.emptyDayMessage')}
          actionLabel={t('itinerary.addActivity')}
          onAction={addActivity}
        />
      ) : (
        <>
          <ProgressSummary progress={dayProgress} />
          <ReorderableActivityList
            activities={activities}
            conflicts={conflicts}
            disabled={saving}
            onReorder={(from, to) => void reorder(from, to)}
            onToggleCompleted={(id) => {
              const activity = byId.get(id);
              if (activity) void toggleCompleted(activity);
            }}
            onOpen={(id) => router.push(routes.itineraryItem(tripId, id))}
            onDragActiveChange={setDragging}
          />
          <AppButton
            label={t('itinerary.addActivity')}
            leftIcon="add"
            variant="outline"
            fullWidth
            onPress={addActivity}
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flexGrow: 1, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center' },
});
