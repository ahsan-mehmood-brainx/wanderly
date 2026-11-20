import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { type LocalDate } from '@/features/trips/domain/localDate';
import { AppBottomSheet, AppChip } from '@/shared/ui';

import { formatDayLabel } from '../format';

interface TripDaySheetProps {
  readonly visible: boolean;
  /** Every day of the trip, first to last. Keep it referentially stable: the chips are rebuilt when it changes. */
  readonly days: readonly LocalDate[];
  readonly value: LocalDate | null;
  readonly onSelect: (date: LocalDate) => void;
  readonly onClose: () => void;
}

/** Picks one of the trip's days; only those are offered, so a new activity can't land outside the trip. */
export function TripDaySheet({ visible, days, value, onSelect, onClose }: TripDaySheetProps) {
  const { t, i18n } = useTranslation();
  const { spacing } = useAppTheme();
  const language = i18n.language;

  // The sheet stays mounted under a form that re-renders on every keystroke, and a trip can
  // be a year long. The chips depend only on the days, the selection and the language, so
  // they're built once per change of those, not once per render. The latest `onSelect` is
  // read through a ref so a new callback identity from the parent doesn't rebuild them.
  const onSelectRef = useRef(onSelect);
  useLayoutEffect(() => {
    onSelectRef.current = onSelect;
  });
  const select = useCallback((date: LocalDate) => onSelectRef.current(date), []);

  const chips = useMemo(
    () =>
      days.map((date, index) => (
        <AppChip
          key={date}
          label={formatDayLabel(date, index + 1, language, t)}
          icon="calendar"
          selected={date === value}
          onPress={() => select(date)}
        />
      )),
    [days, value, language, t, select],
  );

  return (
    <AppBottomSheet visible={visible} onClose={onClose} title={t('itinerary.dayPicker.title')} testID="trip-day-sheet">
      <ScrollView>
        <View style={{ gap: spacing.sm }}>{chips}</View>
      </ScrollView>
    </AppBottomSheet>
  );
}
