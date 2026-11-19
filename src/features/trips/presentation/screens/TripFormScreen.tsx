import { router, useNavigation, usePreventRemove } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { getErrorMessageKey } from '@/core/errors/errorMessages';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { DestinationImage } from '@/features/discover/presentation/components/DestinationImage';
import { routes } from '@/shared/navigation/routes';
import { AppButton, AppEmptyView, AppErrorView, AppInput, AppLoader, AppText, InlineMessage } from '@/shared/ui';

import { currencyFractionDigits } from '../../domain/money';
import { type Trip, TRIP_LIMITS } from '../../domain/Trip';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { CurrencySheet } from '../components/CurrencySheet';
import { DateRangeSheet } from '../components/DateRangeSheet';
import { DestinationSheet } from '../components/DestinationSheet';
import { PickerField } from '../components/PickerField';
import { fieldErrorMessage, formatTripDates } from '../format';
import { useTripForm } from '../hooks/useTripForm';
import { useTrip } from '../hooks/useTrips';
import { useToday } from '../hooks/useToday';

export function CreateTripScreen() {
  return <TripForm trip={null} />;
}

export function EditTripScreen({ tripId }: { readonly tripId: string }) {
  const { t } = useTranslation();
  const { trip, loading, failed, errorKind, retry } = useTrip(tripId);
  // The form copies the trip once, so it starts only when the trip is known.
  if (trip) return <TripForm key={tripId} trip={trip} />;
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
    />
  );
}

type OpenSheet = 'destination' | 'dates' | 'currency' | null;
/** The navigation that was held back while the form has unsaved edits. */
type LeaveAction = Parameters<NonNullable<Parameters<typeof usePreventRemove>[1]>>[0]['data']['action'];

function TripForm({ trip }: { readonly trip: Trip | null }) {
  const { t, i18n } = useTranslation();
  const { colors, spacing, radii, sizes } = useAppTheme();
  const navigation = useNavigation();
  const today = useToday();
  const form = useTripForm(trip);
  const { input, errors, savedTrip } = form;
  const language = i18n.language;
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [pendingLeave, setPendingLeave] = useState<LeaveAction | null>(null);
  const [confirmedLeave, setConfirmedLeave] = useState<LeaveAction | null>(null);

  // Leaving with unsaved edits asks first.
  usePreventRemove(form.dirty && confirmedLeave === null, ({ data }) => setPendingLeave(data.action));

  useEffect(() => {
    if (!confirmedLeave) return;
    // As below: the guard must be off before the held-back navigation runs again.
    const timer = setTimeout(() => navigation.dispatch(confirmedLeave), 0);
    return () => clearTimeout(timer);
  }, [confirmedLeave, navigation]);

  const isEditing = trip !== null;
  useEffect(() => {
    if (!savedTrip) return;
    // One macrotask later, so the leave guard has switched off.
    const timer = setTimeout(() => {
      if (isEditing) router.back();
      else router.replace(routes.trip(savedTrip.id));
    }, 0);
    return () => clearTimeout(timer);
  }, [savedTrip, isEditing]);

  const errorFor = (field: Parameters<typeof fieldErrorMessage>[0]) =>
    fieldErrorMessage(field, errors, input.currency, language, t);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.fill, { backgroundColor: colors.background }]}
    >
      <ScrollView
        testID="trip-form"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentInsetAdjustmentBehavior="automatic"
        style={styles.fill}
        contentContainerStyle={[
          styles.content,
          { maxWidth: sizes.maxContentWidth, padding: spacing.lg, gap: spacing.lg },
        ]}
      >
        {form.coverSupported ? (
          <View style={{ gap: spacing.sm }}>
            <AppText variant="label" color="textSecondary">
              {t('trips.form.cover')}
            </AppText>
            {form.coverUri ? (
              <DestinationImage
                uri={form.coverUri}
                kind="place"
                accessibilityLabel={t('trips.form.coverAlt')}
                style={[styles.cover, { borderRadius: radii.lg }]}
              />
            ) : null}
            <View style={[styles.coverActions, { gap: spacing.sm }]}>
              <AppButton
                label={form.coverUri ? t('trips.form.coverChange') : t('trips.form.coverAdd')}
                variant="outline"
                size="sm"
                leftIcon="image"
                onPress={() => void form.pickCover()}
              />
              {form.coverUri ? (
                <AppButton
                  label={t('trips.form.coverRemove')}
                  variant="ghost"
                  size="sm"
                  leftIcon="trash"
                  onPress={form.removeCover}
                />
              ) : null}
            </View>
            {form.coverNotice ? <InlineMessage message={t('trips.form.coverPickFailed')} /> : null}
          </View>
        ) : null}

        <AppInput
          label={t('trips.form.title')}
          placeholder={t('trips.form.titlePlaceholder')}
          value={input.title}
          onChangeText={form.setTitle}
          error={errorFor('title')}
          maxLength={TRIP_LIMITS.titleMaxLength}
          returnKeyType="next"
        />
        <PickerField
          label={t('trips.form.destination')}
          value={input.destination?.name ?? null}
          placeholder={t('trips.form.destinationPlaceholder')}
          icon="location"
          error={errorFor('destination')}
          onPress={() => setSheet('destination')}
          testID="trip-destination-field"
        />
        <PickerField
          label={t('trips.form.dates')}
          value={input.startDate && input.endDate ? formatTripDates(input.startDate, input.endDate, language) : null}
          placeholder={t('trips.form.datesPlaceholder')}
          icon="calendar"
          hint={t('trips.form.datesHint')}
          error={errorFor('dates')}
          onPress={() => setSheet('dates')}
          testID="trip-dates-field"
        />
        <View style={[styles.budgetRow, { gap: spacing.md }]}>
          <AppInput
            label={t('trips.form.budget')}
            placeholder={currencyFractionDigits(input.currency) === 0 ? '0' : t('trips.form.budgetPlaceholder')}
            value={input.budget}
            onChangeText={form.setBudget}
            error={errorFor('budget')}
            keyboardType={currencyFractionDigits(input.currency) === 0 ? 'number-pad' : 'decimal-pad'}
            leftIcon="currency"
            containerStyle={styles.fill}
          />
          <View style={styles.currency}>
            <PickerField
              label={t('trips.form.currency')}
              value={input.currency}
              placeholder={input.currency}
              icon="wallet"
              error={errorFor('currency')}
              onPress={() => setSheet('currency')}
              testID="trip-currency-field"
            />
          </View>
        </View>
        <AppInput
          label={t('trips.form.description')}
          placeholder={t('trips.form.descriptionPlaceholder')}
          hint={t('trips.form.optional')}
          value={input.description}
          onChangeText={form.setDescription}
          error={errorFor('description')}
          maxLength={TRIP_LIMITS.descriptionMaxLength}
          multiline
        />

        {form.failure ? <InlineMessage message={t(getErrorMessageKey(form.failure))} /> : null}

        <AppButton
          label={isEditing ? t('trips.form.save') : t('trips.form.create')}
          fullWidth
          size="lg"
          loading={form.saving}
          onPress={() => void form.submit()}
        />
      </ScrollView>

      <DestinationSheet
        visible={sheet === 'destination'}
        onClose={() => setSheet(null)}
        onSelect={(destination) => {
          form.setDestination(destination);
          setSheet(null);
        }}
      />
      <DateRangeSheet
        visible={sheet === 'dates'}
        startDate={input.startDate}
        endDate={input.endDate}
        today={today}
        onClose={() => setSheet(null)}
        onApply={(startDate, endDate) => {
          form.setDates(startDate, endDate);
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
      <ConfirmSheet
        visible={pendingLeave !== null}
        title={t('trips.form.discardTitle')}
        message={t('trips.form.discardMessage')}
        confirmLabel={t('trips.form.discard')}
        cancelLabel={t('trips.form.keepEditing')}
        onCancel={() => setPendingLeave(null)}
        onConfirm={() => {
          setConfirmedLeave(pendingLeave);
          setPendingLeave(null);
        }}
        testID="discard-trip-sheet"
      />
    </KeyboardAvoidingView>
  );
}

const CURRENCY_FIELD_WIDTH = 132;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flexGrow: 1, width: '100%', alignSelf: 'center' },
  cover: { width: '100%', aspectRatio: 16 / 9 },
  coverActions: { flexDirection: 'row', flexWrap: 'wrap' },
  budgetRow: { flexDirection: 'row', alignItems: 'flex-start' },
  currency: { width: CURRENCY_FIELD_WIDTH },
});
