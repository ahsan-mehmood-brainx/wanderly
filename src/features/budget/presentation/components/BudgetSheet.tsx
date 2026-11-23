import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { type AppErrorKind } from '@/core/errors/AppError';
import { getErrorMessageKey } from '@/core/errors/errorMessages';
import { useAppDispatch, useAppSelector } from '@/core/store/hooks';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { currencyFractionDigits, formatAmountInput } from '@/features/trips/domain/money';
import { type StoredTrip, type TripInput } from '@/features/trips/domain/Trip';
import { type TripField, type TripValidationErrors } from '@/features/trips/domain/tripValidation';
import { CurrencySheet } from '@/features/trips/presentation/components/CurrencySheet';
import { PickerField } from '@/features/trips/presentation/components/PickerField';
import { fieldErrorMessage } from '@/features/trips/presentation/format';
import { selectTripsSaving } from '@/features/trips/presentation/state/selectors';
import { updateTrip } from '@/features/trips/presentation/state/tripsSlice';
import { AppBottomSheet, AppButton, AppInput, AppText, InlineMessage } from '@/shared/ui';

interface BudgetSheetProps {
  readonly visible: boolean;
  readonly trip: StoredTrip;
  readonly onClose: () => void;
}

/** The trip's other fields unchanged, with the new budget and currency (as the trip form would send them). */
function tripInput(trip: StoredTrip, budget: string, currency: string): TripInput {
  return {
    title: trip.title,
    destination: { id: trip.destinationId, name: trip.destinationName },
    startDate: trip.startDate,
    endDate: trip.endDate,
    description: trip.description,
    coverImage: trip.coverImage,
    budget,
    currency,
  };
}

/**
 * Sets the trip's budget and base currency. They are the trip's own fields, so this
 * saves the trip (with the trip form's rules); a new currency makes the budget
 * convert every expense again on its next load.
 */
export function BudgetSheet({ visible, trip, onClose }: BudgetSheetProps) {
  const { t, i18n } = useTranslation();
  const { spacing } = useAppTheme();
  const dispatch = useAppDispatch();
  const saving = useAppSelector(selectTripsSaving);
  const [budget, setBudget] = useState(() => formatAmountInput(trip.budget, trip.currency));
  const [currency, setCurrency] = useState(trip.currency);
  const [pickingCurrency, setPickingCurrency] = useState(false);
  const [errors, setErrors] = useState<TripValidationErrors | null>(null);
  const [failure, setFailure] = useState<AppErrorKind | null>(null);

  const close = () => {
    setBudget(formatAmountInput(trip.budget, trip.currency));
    setCurrency(trip.currency);
    setErrors(null);
    setFailure(null);
    onClose();
  };

  const save = async () => {
    setFailure(null);
    const action = await dispatch(updateTrip({ id: trip.id, input: tripInput(trip, budget, currency) }));
    if (updateTrip.rejected.match(action)) {
      if (!action.meta.condition) setFailure('unknown');
      return;
    }
    const outcome = action.payload;
    if (outcome.status === 'saved') {
      setErrors(null);
      onClose();
    } else if (outcome.status === 'invalid') {
      setErrors(outcome.errors);
    } else {
      setFailure(outcome.errorKind);
    }
  };

  const errorFor = (field: TripField) => fieldErrorMessage(field, errors, currency, i18n.language, t);
  // Fields the sheet doesn't show still block saving; their message says what the trip needs.
  const otherError = (['title', 'destination', 'dates', 'description'] as const)
    .map((field) => errorFor(field))
    .find((message) => message !== undefined);

  return (
    <>
      <AppBottomSheet
        visible={visible && !pickingCurrency}
        onClose={close}
        title={t('budget.sheet.title')}
        testID="budget-sheet"
      >
        <View style={{ gap: spacing.lg }}>
          <AppInput
            label={t('budget.sheet.amount')}
            placeholder={currencyFractionDigits(currency) === 0 ? '0' : t('trips.form.budgetPlaceholder')}
            value={budget}
            onChangeText={setBudget}
            error={errorFor('budget')}
            keyboardType={currencyFractionDigits(currency) === 0 ? 'number-pad' : 'decimal-pad'}
            leftIcon="currency"
          />
          <View style={{ gap: spacing.xs }}>
            <PickerField
              label={t('budget.sheet.currency')}
              value={currency}
              placeholder={currency}
              icon="wallet"
              error={errorFor('currency')}
              onPress={() => setPickingCurrency(true)}
              testID="budget-currency-field"
            />
            <AppText variant="caption" color="textSecondary">
              {t('budget.sheet.currencyHint')}
            </AppText>
          </View>
          {otherError ? <InlineMessage message={otherError} /> : null}
          {failure ? <InlineMessage message={t(getErrorMessageKey(failure))} /> : null}
          <AppButton label={t('budget.sheet.save')} fullWidth loading={saving} onPress={() => void save()} />
        </View>
      </AppBottomSheet>
      <CurrencySheet
        visible={visible && pickingCurrency}
        value={currency}
        onClose={() => setPickingCurrency(false)}
        onSelect={(next) => {
          // An amount typed for one currency means something else in another, so it's entered again.
          if (next !== currency) setBudget('');
          setCurrency(next);
          setPickingCurrency(false);
        }}
      />
    </>
  );
}
