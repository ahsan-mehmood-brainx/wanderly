import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppIcon, AppText } from '@/shared/ui';

import { type ForecastTimeZone, type HourlyForecast } from '../../domain/Weather';
import { HOUR_MS } from '../../domain/weatherCalculations';
import {
  conditionLabel,
  formatClockTime,
  formatPercent,
  formatTemperature,
  speakPercent,
  speakTemperature,
} from '../format';
import { type WeatherUnits } from '../units';
import { WeatherIcon } from './WeatherIcon';

interface HourlyForecastStripProps {
  readonly hours: readonly HourlyForecast[];
  readonly timeZone: ForecastTimeZone;
  readonly units: WeatherUnits;
  readonly now: number;
}

/** Chance of rain worth pointing out; below this the label is noise. */
const RAIN_NOTICE_PERCENT = 10;
const ITEM_WIDTH = 64;

/** Horizontally scrolling hours, the current one labelled "Now". Times are local to the forecast location. */
export function HourlyForecastStrip({ hours, timeZone, units, now }: HourlyForecastStripProps) {
  const { t, i18n } = useTranslation();
  const { spacing, radii, colors } = useAppTheme();

  if (hours.length === 0) {
    return <AppText color="textSecondary">{t('weather.noHourly')}</AppText>;
  }

  return (
    <FlatList
      horizontal
      data={hours}
      keyExtractor={(hour) => String(hour.time)}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.xs }}
      initialNumToRender={8}
      getItemLayout={(_, index) => ({
        length: ITEM_WIDTH + spacing.xs,
        offset: (ITEM_WIDTH + spacing.xs) * index,
        index,
      })}
      testID="weather-hourly"
      renderItem={({ item: hour }) => {
        const isNow = hour.time <= now && now < hour.time + HOUR_MS;
        const time = isNow ? t('weather.now') : formatClockTime(hour.time, timeZone, i18n.language);
        const rain = hour.precipitationProbability;
        return (
          <View
            accessible
            accessibilityLabel={t('weather.a11y.hour', {
              time,
              temperature: speakTemperature(hour.temperatureC, units, t),
              condition: conditionLabel(hour.condition, t),
              rain: speakPercent(rain, i18n.language, t),
            })}
            style={[
              styles.item,
              {
                width: ITEM_WIDTH,
                gap: spacing.xs,
                paddingVertical: spacing.md,
                borderRadius: radii.md,
                backgroundColor: isNow ? colors.primaryMuted : 'transparent',
              },
            ]}
          >
            <AppText variant="caption" color={isNow ? 'primary' : 'textSecondary'} numberOfLines={1}>
              {time}
            </AppText>
            <WeatherIcon condition={hour.condition} isDay={hour.isDay} size="lg" />
            <AppText variant="headline">{formatTemperature(hour.temperatureC, units, t)}</AppText>
            <View
              style={[styles.rain, { gap: spacing.xxs, opacity: rain !== null && rain >= RAIN_NOTICE_PERCENT ? 1 : 0 }]}
            >
              <AppIcon name="raindrop" size={10} color="info" />
              <AppText variant="caption" color="info" style={styles.rainText}>
                {formatPercent(rain, i18n.language, t)}
              </AppText>
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  item: { alignItems: 'center' },
  rain: { flexDirection: 'row', alignItems: 'center' },
  rainText: { fontSize: 11, lineHeight: 14 },
});
