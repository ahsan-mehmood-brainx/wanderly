import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppBottomSheet, AppButton, AppChip, AppText } from '@/shared/ui';

import { formatLocalTime, type LocalTime, parseLocalTime } from '../../domain/localTime';

interface TimeSheetProps {
  readonly visible: boolean;
  readonly title: string;
  /** The current time, preselected when the sheet opens. */
  readonly value: LocalTime | null;
  readonly onApply: (time: LocalTime) => void;
  readonly onClear: () => void;
  readonly onClose: () => void;
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES = Array.from({ length: 12 }, (_, step) => step * 5);
const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Picks a wall-clock time with hour (24-hour, `HH`) and 5-minute (`:mm`) chips.
 * A sheet rather than a native picker, so it works the same everywhere without
 * another dependency, like the trip date sheet.
 */
export function TimeSheet({ visible, title, value, onApply, onClear, onClose }: TimeSheetProps) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const [hour, setHour] = useState<number | null>(null);
  const [minute, setMinute] = useState(0);

  // Start from the field's value each time the sheet opens.
  const [wasVisible, setWasVisible] = useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      const parts = parseLocalTime(value);
      setHour(parts?.hour ?? null);
      setMinute(parts ? parts.minute - (parts.minute % 5) : 0);
    }
  }

  return (
    <AppBottomSheet visible={visible} onClose={onClose} title={title} testID="time-sheet">
      <ScrollView>
        <View style={{ gap: spacing.lg }}>
          <View style={{ gap: spacing.sm }}>
            <AppText variant="label" color="textSecondary" accessibilityRole="header">
              {t('itinerary.timePicker.hours')}
            </AppText>
            <View style={[styles.grid, { gap: spacing.sm }]}>
              {HOURS.map((option) => (
                <AppChip key={option} label={pad(option)} selected={option === hour} onPress={() => setHour(option)} />
              ))}
            </View>
          </View>
          <View style={{ gap: spacing.sm }}>
            <AppText variant="label" color="textSecondary" accessibilityRole="header">
              {t('itinerary.timePicker.minutes')}
            </AppText>
            <View style={[styles.grid, { gap: spacing.sm }]}>
              {MINUTES.map((option) => (
                <AppChip
                  key={option}
                  label={`:${pad(option)}`}
                  selected={option === minute}
                  onPress={() => setMinute(option)}
                />
              ))}
            </View>
          </View>
          <View style={{ gap: spacing.sm }}>
            <AppButton
              label={t('itinerary.timePicker.apply')}
              fullWidth
              disabled={hour === null}
              onPress={() => {
                if (hour !== null) onApply(formatLocalTime({ hour, minute }));
              }}
            />
            {value !== null ? (
              <AppButton label={t('itinerary.timePicker.clear')} variant="ghost" fullWidth onPress={onClear} />
            ) : null}
          </View>
        </View>
      </ScrollView>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
});
