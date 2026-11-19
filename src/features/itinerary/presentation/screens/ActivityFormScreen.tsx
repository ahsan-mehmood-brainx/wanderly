import { router, useNavigation, usePreventRemove } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { getErrorMessageKey } from '@/core/errors/errorMessages';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatPinLabel } from '@/features/map/domain/geo';
import { type LocalDate } from '@/features/trips/domain/localDate';
import { currencyFractionDigits } from '@/features/trips/domain/money';
import { type StoredTrip } from '@/features/trips/domain/Trip';
import { ConfirmSheet } from '@/features/trips/presentation/components/ConfirmSheet';
import { CurrencySheet } from '@/features/trips/presentation/components/CurrencySheet';
import { PickerField } from '@/features/trips/presentation/components/PickerField';
import { useConnectivity } from '@/shared/hooks/useConnectivity';
import { routes } from '@/shared/navigation/routes';
import { AppButton, AppEmptyView, AppInput, AppText, InlineMessage } from '@/shared/ui';

import { type Activity, ACTIVITY_LIMITS } from '../../domain/Activity';
import { type ActivityField } from '../../domain/activityValidation';
import { dayNumberOf, isTripDay, tripDays } from '../../domain/itinerary';
import { CategoryPicker } from '../components/CategoryPicker';
import { ItineraryStateView } from '../components/ItineraryStateView';
import { LocationSheet } from '../components/LocationSheet';
import { TimeSheet } from '../components/TimeSheet';
import { TripDaySheet } from '../components/TripDaySheet';
import { activityFieldError, formatDayLabel, formatTime, formatTimeRange } from '../format';
import { useActivityForm } from '../hooks/useActivityForm';
import { useActivity, useItinerary } from '../hooks/useItinerary';

interface NewActivityScreenProps {
  readonly tripId: string;
  /** Day to preselect, when opened from a day. */
  readonly date: LocalDate | null;
}

interface EditActivityScreenProps {
  readonly tripId: string;
  readonly activityId: string;
}

export function NewActivityScreen({ tripId, date }: NewActivityScreenProps) {
  const { screen, trip, retry } = useItinerary(tripId);
  // The form copies its starting values once, so it starts only when the trip is known.
  if (screen.kind !== 'ready' || !trip) {
    return <ItineraryStateView state={screen.kind === 'ready' ? { kind: 'loading' } : screen} onRetry={retry} />;
  }
  // A day outside the trip can't take a new activity, so the traveller picks one of the trip's days instead.
  const presetDate = date !== null && isTripDay(date, trip) ? date : null;
  return <ActivityForm key={tripId} trip={trip} activity={null} presetDate={presetDate} />;
}

export function EditActivityScreen({ tripId, activityId }: EditActivityScreenProps) {
  const { t } = useTranslation();
  const { screen, trip, activity, retry } = useActivity(tripId, activityId);
  if (screen.kind !== 'ready' || !trip) {
    return <ItineraryStateView state={screen.kind === 'ready' ? { kind: 'loading' } : screen} onRetry={retry} />;
  }
  if (!activity) {
    return (
      <AppEmptyView
        fullScreen
        icon="calendar"
        title={t('itinerary.notFoundTitle')}
        message={t('itinerary.notFoundMessage')}
        actionLabel={t('itinerary.backToItinerary')}
        onAction={() => router.navigate(routes.itinerary(tripId))}
      />
    );
  }
  return <ActivityForm key={activity.id} trip={trip} activity={activity} presetDate={null} />;
}

type OpenSheet = 'day' | 'startTime' | 'endTime' | 'currency' | 'place' | null;
/** The navigation that was held back while the form has unsaved edits. */
type LeaveAction = Parameters<NonNullable<Parameters<typeof usePreventRemove>[1]>>[0]['data']['action'];
type LocationNotice = 'denied' | 'failed' | null;

interface ActivityFormProps {
  readonly trip: StoredTrip;
  readonly activity: Activity | null;
  readonly presetDate: LocalDate | null;
}

function ActivityForm({ trip, activity, presetDate }: ActivityFormProps) {
  const { t, i18n } = useTranslation();
  const { colors, spacing, sizes } = useAppTheme();
  const navigation = useNavigation();
  const { isOffline } = useConnectivity();
  const { getCurrentLocation, checkMapLocationPermission, requestMapLocationPermission } = useDependencies();
  const form = useActivityForm(trip, activity, presetDate);
  const { input, errors, savedActivity } = form;
  const language = i18n.language;
  // Up to a year of days; recomputed only when the trip's dates change, not on every keystroke.
  const { startDate, endDate } = trip;
  const days = useMemo(() => tripDays({ startDate, endDate }), [startDate, endDate]);
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [pendingLeave, setPendingLeave] = useState<LeaveAction | null>(null);
  const [confirmedLeave, setConfirmedLeave] = useState<LeaveAction | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState<LocationNotice>(null);

  // Leaving with unsaved edits asks first.
  usePreventRemove(form.dirty && confirmedLeave === null, ({ data }) => setPendingLeave(data.action));

  useEffect(() => {
    if (!confirmedLeave) return;
    // The guard must be off before the held-back navigation runs again.
    const timer = setTimeout(() => navigation.dispatch(confirmedLeave), 0);
    return () => clearTimeout(timer);
  }, [confirmedLeave, navigation]);

  useEffect(() => {
    if (!savedActivity) return;
    // One macrotask later, so the leave guard has switched off.
    const timer = setTimeout(() => {
      if (router.canGoBack()) router.back();
      else router.replace(routes.itineraryDay(savedActivity.tripId, savedActivity.date));
    }, 0);
    return () => clearTimeout(timer);
  }, [savedActivity]);

  const errorFor = (field: ActivityField) => activityFieldError(field, errors, input.currency, language, t);

  const pinCurrentLocation = async () => {
    if (locating) return;
    setLocating(true);
    setLocationNotice(null);
    let permission = await checkMapLocationPermission.execute();
    // `denied` can still be asked again (unlike `blocked`), the same as on the map.
    if (permission === 'undetermined' || permission === 'denied') {
      permission = await requestMapLocationPermission.execute();
    }
    if (permission !== 'granted') {
      setLocating(false);
      setLocationNotice('denied');
      return;
    }
    const position = await getCurrentLocation.execute({});
    setLocating(false);
    if (position.ok) form.setLocation(position.value);
    else setLocationNotice(position.error.kind === 'locationPermissionDenied' ? 'denied' : 'failed');
  };

  const locationError = errorFor('location');
  const overlapWarning = form.overlaps
    .map((other) =>
      t('itinerary.form.overlapWarning', {
        title: other.title,
        times: other.startTime ? formatTimeRange(other.startTime, other.endTime, language) : '',
      }),
    )
    .join('\n');

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.fill, { backgroundColor: colors.background }]}
    >
      <ScrollView
        testID="activity-form"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentInsetAdjustmentBehavior="automatic"
        style={styles.fill}
        contentContainerStyle={[
          styles.content,
          { maxWidth: sizes.maxContentWidth, padding: spacing.lg, gap: spacing.lg },
        ]}
      >
        <AppInput
          label={t('itinerary.form.title')}
          placeholder={t('itinerary.form.titlePlaceholder')}
          value={input.title}
          onChangeText={form.setTitle}
          error={errorFor('title')}
          maxLength={ACTIVITY_LIMITS.titleMaxLength}
          returnKeyType="next"
        />
        <CategoryPicker value={input.category} onChange={form.setCategory} error={errorFor('category')} />
        <PickerField
          label={t('itinerary.form.day')}
          value={input.date ? formatDayLabel(input.date, dayNumberOf(trip, input.date), language, t) : null}
          placeholder={t('itinerary.form.dayPlaceholder')}
          icon="calendar"
          error={errorFor('date')}
          onPress={() => setSheet('day')}
          testID="activity-day-field"
        />
        <View style={[styles.row, { gap: spacing.md }]}>
          <View style={styles.fill}>
            <PickerField
              label={t('itinerary.form.startTime')}
              value={input.startTime ? formatTime(input.startTime, language) : null}
              placeholder={t('itinerary.form.timePlaceholder')}
              icon="clock"
              error={errorFor('startTime')}
              onPress={() => setSheet('startTime')}
              testID="activity-start-time-field"
            />
          </View>
          <View style={styles.fill}>
            <PickerField
              label={t('itinerary.form.endTime')}
              value={input.endTime ? formatTime(input.endTime, language) : null}
              placeholder={t('itinerary.form.timePlaceholder')}
              icon="clock"
              error={errorFor('endTime')}
              onPress={() => setSheet('endTime')}
              testID="activity-end-time-field"
            />
          </View>
        </View>
        <AppText variant="caption" color="textSecondary">
          {t('itinerary.form.timeHint')}
        </AppText>
        {overlapWarning ? <InlineMessage tone="warning" icon="warning" message={overlapWarning} /> : null}

        <View style={{ gap: spacing.sm }}>
          <AppText variant="label" color="textSecondary" accessibilityRole="header">
            {t('itinerary.form.location')}
          </AppText>
          <AppInput
            label={t('itinerary.form.address')}
            placeholder={t('itinerary.form.addressPlaceholder')}
            hint={t('itinerary.form.optional')}
            value={input.address}
            onChangeText={form.setAddress}
            error={errorFor('address')}
            maxLength={ACTIVITY_LIMITS.addressMaxLength}
            leftIcon="location"
          />
          <View style={[styles.wrap, { gap: spacing.sm }]}>
            <AppButton
              label={t('itinerary.form.useCurrentLocation')}
              variant="outline"
              size="sm"
              leftIcon="myLocation"
              loading={locating}
              onPress={() => void pinCurrentLocation()}
            />
            <AppButton
              label={t('itinerary.form.searchPlaces')}
              variant="outline"
              size="sm"
              leftIcon="search"
              disabled={isOffline}
              onPress={() => setSheet('place')}
            />
          </View>
          {isOffline ? (
            <AppText variant="caption" color="textSecondary">
              {t('itinerary.form.searchOffline')}
            </AppText>
          ) : null}
          {input.latitude !== null && input.longitude !== null ? (
            <View style={[styles.row, styles.center, { gap: spacing.sm }]}>
              <AppText variant="callout" color="textSecondary" style={styles.fill}>
                {t('itinerary.form.pinned', {
                  coordinates: formatPinLabel({ latitude: input.latitude, longitude: input.longitude }),
                })}
              </AppText>
              <AppButton
                label={t('itinerary.form.removePin')}
                variant="ghost"
                size="sm"
                onPress={() => form.setLocation(null)}
              />
            </View>
          ) : null}
          {locationError ? <InlineMessage message={locationError} /> : null}
          {locationNotice ? (
            <InlineMessage
              message={
                locationNotice === 'denied'
                  ? t('itinerary.form.locationDenied')
                  : t(getErrorMessageKey('locationUnavailable'))
              }
              dismissLabel={t('common.dismiss')}
              onDismiss={() => setLocationNotice(null)}
            />
          ) : null}
        </View>

        <View style={[styles.row, { gap: spacing.md }]}>
          <AppInput
            label={t('itinerary.form.cost')}
            placeholder={currencyFractionDigits(input.currency) === 0 ? '0' : t('itinerary.form.costPlaceholder')}
            hint={t('itinerary.form.optional')}
            value={input.estimatedCost}
            onChangeText={form.setEstimatedCost}
            error={errorFor('cost')}
            keyboardType={currencyFractionDigits(input.currency) === 0 ? 'number-pad' : 'decimal-pad'}
            leftIcon="currency"
            containerStyle={styles.fill}
          />
          <View style={styles.currency}>
            <PickerField
              label={t('itinerary.form.currency')}
              value={input.currency}
              placeholder={input.currency}
              icon="wallet"
              error={errorFor('currency')}
              onPress={() => setSheet('currency')}
              testID="activity-currency-field"
            />
          </View>
        </View>
        <AppInput
          label={t('itinerary.form.notes')}
          placeholder={t('itinerary.form.notesPlaceholder')}
          hint={t('itinerary.form.optional')}
          value={input.notes}
          onChangeText={form.setNotes}
          error={errorFor('notes')}
          maxLength={ACTIVITY_LIMITS.notesMaxLength}
          multiline
        />
        <AppInput
          label={t('itinerary.form.description')}
          placeholder={t('itinerary.form.descriptionPlaceholder')}
          hint={t('itinerary.form.optional')}
          value={input.description}
          onChangeText={form.setDescription}
          error={errorFor('description')}
          maxLength={ACTIVITY_LIMITS.descriptionMaxLength}
          multiline
        />

        {form.failure ? <InlineMessage message={t(getErrorMessageKey(form.failure))} /> : null}

        <AppButton
          label={activity ? t('itinerary.form.save') : t('itinerary.form.create')}
          fullWidth
          size="lg"
          loading={form.saving}
          onPress={() => void form.submit()}
        />
      </ScrollView>

      <TripDaySheet
        visible={sheet === 'day'}
        days={days}
        value={input.date}
        onClose={() => setSheet(null)}
        onSelect={(date) => {
          form.setDate(date);
          setSheet(null);
        }}
      />
      <TimeSheet
        visible={sheet === 'startTime' || sheet === 'endTime'}
        title={sheet === 'endTime' ? t('itinerary.timePicker.endTitle') : t('itinerary.timePicker.startTitle')}
        value={sheet === 'endTime' ? input.endTime : input.startTime}
        onClose={() => setSheet(null)}
        onApply={(time) => {
          if (sheet === 'endTime') form.setEndTime(time);
          else form.setStartTime(time);
          setSheet(null);
        }}
        onClear={() => {
          if (sheet === 'endTime') form.setEndTime(null);
          else form.setStartTime(null);
          setSheet(null);
        }}
      />
      <CurrencySheet
        visible={sheet === 'currency'}
        value={input.currency}
        onClose={() => setSheet(null)}
        onSelect={(currency) => {
          form.setCurrency(currency);
          setSheet(null);
        }}
      />
      <LocationSheet
        visible={sheet === 'place'}
        onClose={() => setSheet(null)}
        onSelect={(place) => {
          form.setLocation(place.coordinates);
          const label = place.subtitle ? `${place.name}, ${place.subtitle}` : place.name;
          form.setAddress(label.slice(0, ACTIVITY_LIMITS.addressMaxLength));
          setSheet(null);
        }}
      />
      <ConfirmSheet
        visible={pendingLeave !== null}
        title={t('itinerary.form.discardTitle')}
        message={t('itinerary.form.discardMessage')}
        confirmLabel={t('itinerary.form.discard')}
        cancelLabel={t('itinerary.form.keepEditing')}
        onCancel={() => setPendingLeave(null)}
        onConfirm={() => {
          setConfirmedLeave(pendingLeave);
          setPendingLeave(null);
        }}
        testID="discard-activity-sheet"
      />
    </KeyboardAvoidingView>
  );
}

const CURRENCY_FIELD_WIDTH = 132;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flexGrow: 1, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  center: { alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  currency: { width: CURRENCY_FIELD_WIDTH },
});
