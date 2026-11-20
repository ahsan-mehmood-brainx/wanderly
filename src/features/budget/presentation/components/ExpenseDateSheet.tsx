import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { addDays, compareLocalDates, type LocalDate } from '@/features/trips/domain/localDate';
import { formatDayDate } from '@/features/itinerary/presentation/format';
import { AppBottomSheet, AppChip } from '@/shared/ui';

interface ExpenseDateSheetProps {
  readonly visible: boolean;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate;
  readonly today: LocalDate;
  readonly value: LocalDate | null;
  readonly onSelect: (date: LocalDate) => void;
  readonly onClose: () => void;
}

/** Days offered before the trip, for bookings paid ahead (flights, hotels). */
const DAYS_BEFORE_TRIP = 30;
/** Longest list of days the sheet offers. */
const MAX_DAYS = 400;

/**
 * Picks the day an expense was paid: the trip's days, a month before it, and up to
 * today if the trip has ended, so bookings and late costs can be logged too.
 */
export function ExpenseDateSheet({
  visible,
  startDate,
  endDate,
  today,
  value,
  onSelect,
  onClose,
}: ExpenseDateSheetProps) {
  const { t, i18n } = useTranslation();
  const { spacing } = useAppTheme();
  const language = i18n.language;

  const days = useMemo(() => {
    const last = compareLocalDates(today, endDate) > 0 ? today : endDate;
    const list: LocalDate[] = [];
    for (
      let day = addDays(startDate, -DAYS_BEFORE_TRIP);
      day <= last && list.length < MAX_DAYS;
      day = addDays(day, 1)
    ) {
      list.push(day);
    }
    if (value !== null && !list.includes(value)) list.push(value);
    return list.sort(compareLocalDates);
  }, [startDate, endDate, today, value]);

  return (
    <AppBottomSheet visible={visible} onClose={onClose} title={t('budget.form.date')} testID="expense-date-sheet">
      <ScrollView>
        <View style={{ gap: spacing.sm }}>
          {visible
            ? days.map((date) => (
                <AppChip
                  key={date}
                  label={formatDayDate(date, language)}
                  icon="calendar"
                  selected={date === value}
                  onPress={() => onSelect(date)}
                />
              ))
            : null}
        </View>
      </ScrollView>
    </AppBottomSheet>
  );
}
