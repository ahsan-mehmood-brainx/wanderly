import { router } from 'expo-router';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, type ListRenderItemInfo, Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { type StoredTrip } from '@/features/trips/domain/Trip';
import { formatTripDates } from '@/features/trips/presentation/format';
import { routes } from '@/shared/navigation/routes';
import { AppBadge, AppButton, AppCard, AppIcon, AppText, InlineMessage } from '@/shared/ui';

import { type Activity } from '../../domain/Activity';
import { type CostTotal, dayTimeSpan, type ItineraryDay, type ItineraryProgress } from '../../domain/itinerary';
import { ItineraryStateView } from '../components/ItineraryStateView';
import { ProgressSummary } from '../components/ProgressCard';
import { CATEGORY_ICONS, formatCost, formatDayDate, formatDayLabel, formatTimeRange } from '../format';
import { useItinerary } from '../hooks/useItinerary';

interface ItineraryOverviewScreenProps {
  /** Validated by the route. */
  readonly tripId: string;
}

/** Every day of the trip with its activities, progress and cost totals. */
export function ItineraryOverviewScreen({ tripId }: ItineraryOverviewScreenProps) {
  const { colors, spacing } = useAppTheme();
  const { screen, trip, groups, progress, costTotals, conflicts, retry } = useItinerary(tripId);

  // A trip can be a year long, so the days are virtualised rather than all mounted at once.
  const renderDay = useCallback(
    ({ item }: ListRenderItemInfo<ItineraryDay>) => (
      <DayCard tripId={tripId} day={item} hasConflict={item.activities.some(({ id }) => conflicts.has(id))} />
    ),
    [tripId, conflicts],
  );

  if (screen.kind !== 'ready' || !trip) {
    return <ItineraryStateView state={screen.kind === 'ready' ? { kind: 'loading' } : screen} onRetry={retry} />;
  }

  return (
    <FlatList
      data={groups.days}
      keyExtractor={dayKey}
      renderItem={renderDay}
      ListHeaderComponent={
        <OverviewHeader trip={trip} progress={progress} costTotals={costTotals} outsideTrip={groups.outsideTrip} />
      }
      contentInsetAdjustmentBehavior="automatic"
      style={[styles.fill, { backgroundColor: colors.background }]}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      testID="itinerary-overview"
    />
  );
}

const dayKey = (day: ItineraryDay) => day.date;

interface OverviewHeaderProps {
  readonly trip: StoredTrip;
  readonly progress: ItineraryProgress;
  readonly costTotals: readonly CostTotal[];
  readonly outsideTrip: readonly Activity[];
}

/** Title, progress, totals, the add button and any activities left outside the trip's dates. */
function OverviewHeader({ trip, progress, costTotals, outsideTrip }: OverviewHeaderProps) {
  const { t, i18n } = useTranslation();
  const { spacing } = useAppTheme();
  const language = i18n.language;

  // `xl` between sections, as on other screens; the list's own `md` gap follows the last one.
  return (
    <View style={{ gap: spacing.xl, paddingBottom: spacing.xl - spacing.md }}>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="title" accessibilityRole="header">
          {trip.title}
        </AppText>
        <AppText variant="callout" color="textSecondary">
          {formatTripDates(trip.startDate, trip.endDate, language)}
        </AppText>
      </View>

      <AppCard variant="outlined">
        <View style={{ gap: spacing.lg }}>
          <ProgressSummary progress={progress} />
          <CostTotals totals={costTotals} />
        </View>
      </AppCard>

      <AppButton
        label={t('itinerary.addActivity')}
        leftIcon="add"
        variant="outline"
        fullWidth
        onPress={() => router.push(routes.newActivity(trip.id))}
      />

      {outsideTrip.length > 0 ? (
        <View testID="itinerary-outside-trip" style={{ gap: spacing.sm }}>
          <InlineMessage
            tone="warning"
            icon="warning"
            title={t('itinerary.outsideTitle')}
            message={t('itinerary.outsideMessage')}
          />
          {outsideTrip.map((activity) => (
            <OutsideActivity key={activity.id} activity={activity} tripId={trip.id} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function CostTotals({ totals }: { readonly totals: readonly CostTotal[] }) {
  const { t, i18n } = useTranslation();
  const { spacing } = useAppTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label" color="textSecondary">
        {t('itinerary.estimatedCosts')}
      </AppText>
      {totals.length === 0 ? (
        <AppText color="textSecondary">{t('itinerary.noCosts')}</AppText>
      ) : (
        <View style={[styles.wrap, { gap: spacing.md }]}>
          {totals.map(({ currency, minor }) => (
            <AppText key={currency} variant="headline">
              {formatCost(minor, currency, i18n.language)}
            </AppText>
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * Titles listed per day card; the rest are summed up as "+N more". A trip can be a year
 * long with dozens of activities a day, and the full list is on the day's own screen.
 */
const MAX_LINES_PER_DAY = 3;

interface DayCardProps {
  readonly tripId: string;
  readonly day: ItineraryDay;
  readonly hasConflict: boolean;
}

/**
 * `groupByDay` builds new day objects whenever any activity changes, so a card compares
 * what it shows instead: unchanged activities keep their identity in the store, so a day
 * whose activities are the same objects in the same order doesn't re-render.
 */
function sameDayCard(previous: DayCardProps, next: DayCardProps): boolean {
  if (
    previous.tripId !== next.tripId ||
    previous.hasConflict !== next.hasConflict ||
    previous.day.date !== next.day.date ||
    previous.day.dayNumber !== next.day.dayNumber
  ) {
    return false;
  }
  const before = previous.day.activities;
  const after = next.day.activities;
  return before.length === after.length && before.every((activity, index) => activity === after[index]);
}

const DayCard = memo(function DayCard({ tripId, day, hasConflict }: DayCardProps) {
  const { t, i18n } = useTranslation();
  const { colors, spacing, radii, sizes } = useAppTheme();
  const language = i18n.language;
  const label = formatDayLabel(day.date, day.dayNumber, language, t);
  const count = day.activities.length;
  const span = dayTimeSpan(day.activities);
  const shown = day.activities.slice(0, MAX_LINES_PER_DAY);
  const hidden = count - shown.length;

  return (
    <Pressable
      testID={`itinerary-day-${day.date}`}
      accessibilityRole="button"
      accessibilityHint={t('itinerary.openDayHint')}
      onPress={() => router.push(routes.itineraryDay(tripId, day.date))}
      style={({ pressed }) => [
        {
          gap: spacing.sm,
          padding: spacing.lg,
          borderRadius: radii.lg,
          borderWidth: sizes.hairline,
          borderColor: colors.borderStrong,
          backgroundColor: pressed ? colors.surfacePressed : colors.surface,
        },
      ]}
    >
      <View style={[styles.header, { gap: spacing.sm }]}>
        <AppText variant="headline" style={styles.flex}>
          {label}
        </AppText>
        <AppIcon name="chevronRight" size="sm" color="textSecondary" />
      </View>
      {count === 0 ? (
        <AppText color="textSecondary">{t('itinerary.emptyDay')}</AppText>
      ) : (
        <>
          <View style={[styles.wrap, { gap: spacing.sm }]}>
            <AppText variant="callout" color="textSecondary">
              {t('itinerary.activityCount', { count })}
            </AppText>
            {span ? (
              <AppText variant="callout" color="textSecondary">
                {formatTimeRange(span.start, span.end, language)}
              </AppText>
            ) : null}
            {hasConflict ? (
              <AppBadge label={t('itinerary.timeConflict')} tone="warning" size="sm" icon="warning" />
            ) : null}
          </View>
          <View style={{ gap: spacing.xxs }}>
            {shown.map((activity) => (
              <ActivityLine key={activity.id} activity={activity} />
            ))}
            {hidden > 0 ? (
              <AppText variant="callout" color="textSecondary">
                {t('itinerary.moreActivities', { count: hidden })}
              </AppText>
            ) : null}
          </View>
        </>
      )}
    </Pressable>
  );
}, sameDayCard);

function ActivityLine({ activity }: { readonly activity: Activity }) {
  const { spacing } = useAppTheme();
  return (
    <View style={[styles.header, { gap: spacing.xs }]}>
      <AppIcon
        name={activity.isCompleted ? 'checkCircle' : CATEGORY_ICONS[activity.category]}
        size="sm"
        color={activity.isCompleted ? 'success' : 'primary'}
      />
      <AppText
        numberOfLines={1}
        color={activity.isCompleted ? 'textSecondary' : 'text'}
        style={[styles.flex, activity.isCompleted ? styles.done : null]}
      >
        {activity.title}
      </AppText>
    </View>
  );
}

function OutsideActivity({ activity, tripId }: { readonly activity: Activity; readonly tripId: string }) {
  const { i18n } = useTranslation();
  return (
    <AppCard
      variant="outlined"
      padding="md"
      onPress={() => router.push(routes.itineraryItem(tripId, activity.id))}
      accessibilityLabel={`${activity.title}, ${formatDayDate(activity.date, i18n.language)}`}
    >
      <AppText variant="headline">{activity.title}</AppText>
      <AppText variant="caption" color="textSecondary">
        {formatDayDate(activity.date, i18n.language)}
      </AppText>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  flex: { flex: 1 },
  done: { textDecorationLine: 'line-through' },
});
