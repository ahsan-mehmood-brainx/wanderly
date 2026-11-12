import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppIcon, AppText, type AppIconName } from '@/shared/ui';

import { type ForecastTimeZone } from '../../domain/Weather';
import { compassPoint, normalizeDegrees, type WeatherSummary } from '../../domain/weatherCalculations';
import {
  formatClockTime,
  formatMillimetres,
  formatPercent,
  formatTemperature,
  formatUvIndex,
  formatWind,
  speakWind,
} from '../format';
import { type WeatherUnits } from '../units';

interface WeatherDetailsGridProps {
  readonly summary: WeatherSummary;
  readonly timeZone: ForecastTimeZone;
  readonly units: WeatherUnits;
}

/** Two-column tiles: feels like, humidity, wind (with a direction arrow), rain, sunrise, sunset, UV, precipitation. */
export function WeatherDetailsGrid({ summary, timeZone, units }: WeatherDetailsGridProps) {
  const { t, i18n } = useTranslation();
  const { spacing } = useAppTheme();
  const { now, today } = summary;
  const language = i18n.language;

  const sunTime = (instant: number | null): string => {
    if (today?.daylight === 'polarDay') return t('weather.daylight.polarDay');
    if (today?.daylight === 'polarNight') return t('weather.daylight.polarNight');
    return instant === null ? t('weather.notAvailable') : formatClockTime(instant, timeZone, language);
  };

  return (
    <View style={[styles.grid, { gap: spacing.sm }]} testID="weather-details">
      <Tile
        icon="thermometer"
        label={t('weather.details.feelsLike')}
        value={formatTemperature(now?.feelsLikeC ?? null, units, t)}
      />
      <Tile
        icon="humidity"
        label={t('weather.details.humidity')}
        value={formatPercent(now?.humidityPercent ?? null, language, t)}
      />
      <Tile
        icon="wind"
        label={t('weather.details.wind')}
        value={formatWind(now?.windSpeedKmh ?? null, now?.windDirectionDeg ?? null, units, t)}
        spokenValue={speakWind(now?.windSpeedKmh ?? null, now?.windDirectionDeg ?? null, units, t)}
        accessory={<WindArrow degrees={now?.windDirectionDeg ?? null} />}
      />
      <Tile
        icon="umbrella"
        label={t('weather.details.rainChance')}
        value={formatPercent(now?.precipitationProbability ?? today?.precipitationProbability ?? null, language, t)}
      />
      <Tile icon="sunrise" label={t('weather.details.sunrise')} value={sunTime(today?.sunrise ?? null)} />
      <Tile icon="sunset" label={t('weather.details.sunset')} value={sunTime(today?.sunset ?? null)} />
      <Tile
        icon="uvIndex"
        label={t('weather.details.uvIndex')}
        value={formatUvIndex(today?.uvIndexMax ?? null, language, t)}
      />
      <Tile
        icon="raindrop"
        label={t('weather.details.precipitation')}
        value={formatMillimetres(today?.precipitationMm ?? null, language, t)}
      />
    </View>
  );
}

interface TileProps {
  readonly icon: AppIconName;
  readonly label: string;
  readonly value: string;
  /** Read instead of `value` when the visible text is abbreviated or a dash. */
  readonly spokenValue?: string;
  readonly accessory?: ReactNode;
}

function Tile({ icon, label, value, spokenValue, accessory }: TileProps) {
  const { t } = useTranslation();
  const { spacing, radii, colors } = useAppTheme();
  const spoken = spokenValue ?? (value === t('weather.notAvailable') ? t('weather.notAvailableA11y') : value);
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${spoken}`}
      style={[
        styles.tile,
        { padding: spacing.md, gap: spacing.xs, borderRadius: radii.md, backgroundColor: colors.surfaceMuted },
      ]}
    >
      <View style={[styles.row, { gap: spacing.xs }]}>
        <AppIcon name={icon} size="sm" color="textSecondary" />
        <AppText variant="caption" color="textSecondary" numberOfLines={1} style={styles.fill}>
          {label}
        </AppText>
      </View>
      <View style={[styles.row, { gap: spacing.sm }]}>
        <AppText variant="subtitle" numberOfLines={2} style={styles.fill}>
          {value}
        </AppText>
        {accessory}
      </View>
    </View>
  );
}

/** Points where the wind blows *to* (opposite its "from" bearing), like an arrow on a weather map. */
function WindArrow({ degrees }: { degrees: number | null }) {
  if (degrees === null || compassPoint(degrees) === null) return null;
  return (
    <View style={{ transform: [{ rotate: `${normalizeDegrees(degrees + 180)}deg` }] }}>
      <AppIcon name="arrowUp" size="md" color="primary" />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  // Two per row with the gap between them.
  tile: { flexBasis: '48%', flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  fill: { flexShrink: 1, flexGrow: 1 },
});
