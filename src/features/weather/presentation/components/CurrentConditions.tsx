import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppCard, AppText } from '@/shared/ui';

import { type ForecastTimeZone } from '../../domain/Weather';
import { type WeatherSummary } from '../../domain/weatherCalculations';
import { conditionLabel, formatClockTime, formatTemperature, speakTemperature } from '../format';
import { type WeatherUnits } from '../units';
import { WeatherIcon } from './WeatherIcon';

interface CurrentConditionsProps {
  readonly placeName: string;
  readonly summary: WeatherSummary;
  readonly timeZone: ForecastTimeZone;
  readonly units: WeatherUnits;
  /** Instant to show as the local time at the place. */
  readonly now: number;
}

const HERO_ICON = 64;

/** The hero: place, local time, big temperature and icon, condition, feels-like and today's high and low. */
export function CurrentConditions({ placeName, summary, timeZone, units, now }: CurrentConditionsProps) {
  const { t, i18n } = useTranslation();
  const { spacing, colors } = useAppTheme();
  const current = summary.now;
  const condition = current?.condition ?? summary.today?.condition ?? 'unknown';
  const temperature = formatTemperature(current?.temperatureC ?? null, units, t);
  const high = formatTemperature(summary.today?.maxTemperatureC ?? null, units, t);
  const low = formatTemperature(summary.today?.minTemperatureC ?? null, units, t);

  return (
    <AppCard variant="elevated" padding="xl" testID="weather-current">
      <View
        style={[styles.centre, { gap: spacing.xs }]}
        accessible
        accessibilityRole="summary"
        accessibilityLabel={t('weather.a11y.current', {
          place: placeName,
          temperature: speakTemperature(current?.temperatureC ?? null, units, t),
          condition: conditionLabel(condition, t),
        })}
      >
        <AppText variant="title" align="center" numberOfLines={2}>
          {placeName}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          {formatClockTime(now, timeZone, i18n.language)}
        </AppText>
        <View style={[styles.row, { gap: spacing.md, marginTop: spacing.sm }]}>
          <WeatherIcon condition={condition} isDay={current?.isDay ?? null} size={HERO_ICON} />
          <AppText style={[styles.temperature, { color: colors.text }]} maxFontSizeMultiplier={1.3}>
            {temperature}
          </AppText>
        </View>
        <AppText variant="subtitle" align="center">
          {conditionLabel(condition, t)}
        </AppText>
        <AppText variant="callout" color="textSecondary" align="center">
          {t('weather.highLow', { high, low })}
        </AppText>
        {current?.feelsLikeC != null ? (
          <AppText variant="callout" color="textSecondary" align="center">
            {t('weather.feelsLike', { value: formatTemperature(current.feelsLikeC, units, t) })}
          </AppText>
        ) : null}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  temperature: { fontSize: 64, lineHeight: 72, fontWeight: '400', letterSpacing: -1.5 },
});
