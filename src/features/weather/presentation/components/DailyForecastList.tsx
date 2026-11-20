import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppDivider, AppText } from '@/shared/ui';

import { type DailyForecast, type ForecastTimeZone } from '../../domain/Weather';
import { rangeBarPosition, type TemperatureSpan } from '../../domain/weatherCalculations';
import {
  conditionLabel,
  formatLongDay,
  formatPercent,
  formatTemperature,
  formatWeekday,
  speakPercent,
  speakTemperature,
} from '../format';
import { type WeatherUnits } from '../units';
import { WeatherIcon } from './WeatherIcon';

interface DailyForecastListProps {
  readonly days: readonly DailyForecast[];
  /** Date (`YYYY-MM-DD`) of today at the location, labelled "Today". */
  readonly todayDate: string | null;
  readonly span: TemperatureSpan | null;
  readonly timeZone: ForecastTimeZone;
  readonly units: WeatherUnits;
}

const RAIN_NOTICE_PERCENT = 10;
const BAR_HEIGHT = 6;

/** One row per day: weekday, icon, chance of rain, and the low–high range drawn against the week's span. */
export function DailyForecastList({ days, todayDate, span, timeZone, units }: DailyForecastListProps) {
  const { t, i18n } = useTranslation();
  const { spacing } = useAppTheme();

  if (days.length === 0) {
    return <AppText color="textSecondary">{t('weather.noDaily')}</AppText>;
  }

  return (
    <View testID="weather-daily">
      {days.map((day, index) => {
        const isToday = day.date === todayDate;
        const rain = day.precipitationProbability;
        return (
          <View key={day.date}>
            {index > 0 ? <AppDivider /> : null}
            <View
              accessible
              accessibilityLabel={t('weather.a11y.day', {
                day: isToday ? t('weather.today') : formatLongDay(day.time, timeZone, i18n.language),
                condition: conditionLabel(day.condition, t),
                high: speakTemperature(day.maxTemperatureC, units, t),
                low: speakTemperature(day.minTemperatureC, units, t),
                rain: speakPercent(rain, i18n.language, t),
              })}
              style={[styles.row, { gap: spacing.md, paddingVertical: spacing.md }]}
            >
              <AppText variant="headline" style={styles.day} numberOfLines={1}>
                {isToday ? t('weather.today') : formatWeekday(day.time, timeZone, i18n.language)}
              </AppText>
              <View style={styles.icon}>
                <WeatherIcon condition={day.condition} isDay size="md" />
                {rain !== null && rain >= RAIN_NOTICE_PERCENT ? (
                  <AppText variant="caption" color="info" style={styles.rain}>
                    {formatPercent(rain, i18n.language, t)}
                  </AppText>
                ) : null}
              </View>
              <AppText color="textSecondary" style={styles.temperature} align="right">
                {formatTemperature(day.minTemperatureC, units, t)}
              </AppText>
              <RangeBar span={span} low={day.minTemperatureC} high={day.maxTemperatureC} />
              <AppText style={styles.temperature}>{formatTemperature(day.maxTemperatureC, units, t)}</AppText>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function RangeBar({ span, low, high }: { span: TemperatureSpan | null; low: number | null; high: number | null }) {
  const { colors, radii } = useAppTheme();
  const position = span ? rangeBarPosition(span, low, high) : null;
  return (
    <View style={[styles.track, { backgroundColor: colors.surfaceMuted, borderRadius: radii.pill }]}>
      {position ? (
        <View
          style={[
            styles.fill,
            {
              // Logical `start`, so the fill flips with the min/max labels in RTL.
              start: `${position.start * 100}%`,
              width: `${Math.max(position.end - position.start, 0.04) * 100}%`,
              backgroundColor: colors.primary,
              borderRadius: radii.pill,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  day: { width: 56 },
  icon: { width: 40, alignItems: 'center' },
  rain: { fontSize: 11, lineHeight: 14 },
  temperature: { width: 40 },
  track: { flex: 1, height: BAR_HEIGHT, overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, bottom: 0 },
});
