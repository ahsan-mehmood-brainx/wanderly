import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppBottomSheet, AppButton, AppIconButton, AppText } from '@/shared/ui';

import {
  addDays,
  dayOfWeek,
  daysBetween,
  daysInMonth,
  formatLocalDate,
  type LocalDate,
  parseLocalDate,
} from '../../domain/localDate';
import { canShiftMonth, type DateRangeSelection, selectDay, shiftMonth } from '../dateRangeSelection';
import { formatTripDate, formatTripDates } from '../format';

interface DateRangeSheetProps {
  readonly visible: boolean;
  readonly startDate: LocalDate | null;
  readonly endDate: LocalDate | null;
  readonly today: LocalDate;
  readonly onApply: (startDate: LocalDate, endDate: LocalDate) => void;
  readonly onClose: () => void;
}

const DAY_HEIGHT = 44;
/** A known Sunday, to name the weekdays. */
const SUNDAY: LocalDate = '2023-01-01';

/** Month grid that picks a first and last day. The sheet mounts its content only while open. */
export function DateRangeSheet({ visible, onClose, ...calendar }: DateRangeSheetProps) {
  const { t } = useTranslation();
  return (
    <AppBottomSheet visible={visible} onClose={onClose} title={t('trips.calendar.title')} testID="date-range-sheet">
      <Calendar {...calendar} />
    </AppBottomSheet>
  );
}

function Calendar({ startDate, endDate, today, onApply }: Omit<DateRangeSheetProps, 'visible' | 'onClose'>) {
  const { t, i18n } = useTranslation();
  const { colors, spacing, radii } = useAppTheme();
  const language = i18n.language;
  const weekStart = language.startsWith('es') ? 1 : 0;

  const [selection, setSelection] = useState<DateRangeSelection>({ start: startDate, end: endDate });
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const { year, month } = parseLocalDate(startDate ?? today) ?? { year: 2000, month: 1 };
    return { year, month };
  });

  const { year, month } = visibleMonth;
  const moveMonth = (delta: number) => setVisibleMonth((current) => shiftMonth(current, delta));

  const firstDay = formatLocalDate({ year, month, day: 1 });
  const leadingBlanks = (dayOfWeek(firstDay) - weekStart + 7) % 7;
  const cells: (LocalDate | null)[] = Array.from<null>({ length: leadingBlanks }).fill(null);
  for (let day = 1; day <= daysInMonth(year, month); day++) cells.push(formatLocalDate({ year, month, day }));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));

  const { start, end } = selection;
  const summary =
    start === null
      ? t('trips.calendar.pickStart')
      : end === null
        ? t('trips.calendar.pickEnd')
        : `${formatTripDates(start, end, language)} · ${t('trips.durationDays', { count: daysBetween(start, end) + 1 })}`;

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.monthRow}>
        <AppIconButton
          icon="chevronLeft"
          accessibilityLabel={t('trips.calendar.previousMonth')}
          disabled={!canShiftMonth(visibleMonth, -1)}
          onPress={() => moveMonth(-1)}
        />
        <AppText variant="headline" accessibilityLiveRegion="polite" testID="calendar-month">
          {formatTripDate(firstDay, language, { month: 'long', year: 'numeric' })}
        </AppText>
        <AppIconButton
          icon="chevronRight"
          accessibilityLabel={t('trips.calendar.nextMonth')}
          disabled={!canShiftMonth(visibleMonth, 1)}
          onPress={() => moveMonth(1)}
        />
      </View>

      <View>
        <View style={styles.week} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {Array.from({ length: 7 }, (_, index) => (
            <AppText key={index} variant="caption" color="textSecondary" align="center" style={styles.cell}>
              {formatTripDate(addDays(SUNDAY, weekStart + index), language, { weekday: 'narrow' })}
            </AppText>
          ))}
        </View>
        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} style={styles.week}>
            {week.map((date, dayIndex) => {
              if (date === null) return <View key={dayIndex} style={styles.cell} />;
              const isEdge = date === start || date === end;
              const inRange = start !== null && end !== null && date > start && date < end;
              return (
                <Pressable
                  key={date}
                  accessibilityRole="button"
                  accessibilityLabel={formatTripDate(date, language, { dateStyle: 'full' })}
                  accessibilityState={{ selected: isEdge || inRange }}
                  onPress={() => setSelection((current) => selectDay(current, date))}
                  style={[styles.cell, styles.day, inRange ? { backgroundColor: colors.primaryMuted } : null]}
                >
                  <View
                    style={[
                      styles.dayMark,
                      { borderRadius: radii.pill },
                      isEdge ? { backgroundColor: colors.primary } : null,
                      !isEdge && date === today ? { borderWidth: 1, borderColor: colors.primary } : null,
                    ]}
                  >
                    <AppText color={isEdge ? 'onPrimary' : 'text'}>{Number(date.slice(8))}</AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <AppText variant="callout" color="textSecondary" align="center" accessibilityLiveRegion="polite">
        {summary}
      </AppText>
      <AppButton
        label={t('trips.calendar.apply')}
        fullWidth
        disabled={start === null || end === null}
        onPress={() => {
          if (start !== null && end !== null) onApply(start, end);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  week: { flexDirection: 'row' },
  cell: { flex: 1 },
  day: { height: DAY_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  dayMark: { width: DAY_HEIGHT - 4, height: DAY_HEIGHT - 4, alignItems: 'center', justifyContent: 'center' },
});
