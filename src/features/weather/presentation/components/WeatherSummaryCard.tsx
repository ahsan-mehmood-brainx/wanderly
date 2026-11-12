import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { getErrorMessageKey } from '@/core/errors/errorMessages';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppButton, AppLoader, AppText, InlineMessage } from '@/shared/ui';

import { conditionLabel, formatClockTime, formatPercent, formatTemperature, speakTemperature } from '../format';
import { type WeatherState } from '../hooks/useWeather';
import { useWeatherUnits } from '../units';
import { SavedForecastNotice } from './SavedForecastNotice';
import { WeatherIcon } from './WeatherIcon';
import { WeatherSection } from './WeatherSection';

interface WeatherSummaryContentProps {
  readonly state: WeatherState;
  readonly placeName: string;
  readonly note?: string | null;
  /** Shows "See full forecast" when provided. */
  readonly onOpenForecast?: () => void;
  readonly noLocationMessage?: string;
}

/** Hours shown in the compact preview row. */
const PREVIEW_HOURS = 5;

/** Compact current weather + the next few hours, for embedding in other screens. */
export function WeatherSummaryContent({
  state,
  placeName,
  note,
  onOpenForecast,
  noLocationMessage,
}: WeatherSummaryContentProps) {
  const { t, i18n } = useTranslation();
  const { spacing } = useAppTheme();
  const units = useWeatherUnits();

  if (state.status === 'loading') {
    return <AppLoader size="small" label={t('weather.loading')} testID="weather-card-loading" />;
  }

  if (state.status === 'error') {
    const message =
      state.errorKind === 'locationUnavailable' && noLocationMessage
        ? noLocationMessage
        : t(getErrorMessageKey(state.errorKind));
    if (!state.retry) {
      return (
        <AppText color="textSecondary" testID="weather-card-unavailable">
          {message}
        </AppText>
      );
    }
    return (
      <View style={{ gap: spacing.md }}>
        <InlineMessage tone="danger" icon="error" message={message} testID="weather-card-error" />
        <AppButton label={t('common.tryAgain')} variant="outline" size="sm" leftIcon="refresh" onPress={state.retry} />
      </View>
    );
  }

  const { report, summary, now } = state;
  const { timeZone } = report.forecast;
  const current = summary.now;
  const condition = current?.condition ?? summary.today?.condition ?? 'unknown';

  return (
    <View style={{ gap: spacing.md }}>
      <SavedForecastNotice report={report} ageMs={summary.ageMs} />
      <View
        style={[styles.row, { gap: spacing.md }]}
        accessible
        accessibilityLabel={t('weather.a11y.current', {
          place: placeName,
          temperature: speakTemperature(current?.temperatureC ?? null, units, t),
          condition: conditionLabel(condition, t),
        })}
        testID="weather-card-current"
      >
        <WeatherIcon condition={condition} isDay={current?.isDay ?? null} size="xxl" />
        <AppText variant="display">{formatTemperature(current?.temperatureC ?? null, units, t)}</AppText>
        <View style={[styles.fill, { gap: spacing.xxs }]}>
          <AppText variant="headline" numberOfLines={2}>
            {conditionLabel(condition, t)}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {t('weather.highLow', {
              high: formatTemperature(summary.today?.maxTemperatureC ?? null, units, t),
              low: formatTemperature(summary.today?.minTemperatureC ?? null, units, t),
            })}
          </AppText>
          {current?.feelsLikeC != null ? (
            <AppText variant="caption" color="textSecondary">
              {t('weather.feelsLike', { value: formatTemperature(current.feelsLikeC, units, t) })}
            </AppText>
          ) : null}
        </View>
      </View>

      {summary.hours.length > 0 ? (
        // The full forecast has the accessible hour-by-hour list; this preview is visual only.
        <View style={styles.hours} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {summary.hours.slice(0, PREVIEW_HOURS).map((hour, index) => (
            <View key={hour.time} style={[styles.hour, { gap: spacing.xxs }]}>
              <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                {index === 0 && hour.time <= now
                  ? t('weather.now')
                  : formatClockTime(hour.time, timeZone, i18n.language)}
              </AppText>
              <WeatherIcon condition={hour.condition} isDay={hour.isDay} size="md" />
              <AppText variant="label">{formatTemperature(hour.temperatureC, units, t)}</AppText>
              {hour.precipitationProbability !== null && hour.precipitationProbability >= 10 ? (
                <AppText variant="caption" color="info" style={styles.small}>
                  {formatPercent(hour.precipitationProbability, i18n.language, t)}
                </AppText>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {note ? (
        <AppText variant="caption" color="textSecondary">
          {note}
        </AppText>
      ) : null}
      {onOpenForecast ? (
        <AppButton
          label={t('weather.seeForecast')}
          variant="ghost"
          size="sm"
          rightIcon="chevronRight"
          onPress={onOpenForecast}
          testID="weather-open-forecast"
        />
      ) : null}
      <AppText variant="caption" color="textTertiary">
        {t('weather.attribution')}
      </AppText>
    </View>
  );
}

interface WeatherSummaryCardProps extends WeatherSummaryContentProps {
  readonly title?: string;
  readonly testID?: string;
}

/** {@link WeatherSummaryContent} in an outlined section card titled "Weather". */
export function WeatherSummaryCard({ title, testID = 'weather-card', ...content }: WeatherSummaryCardProps) {
  const { t } = useTranslation();
  return (
    <WeatherSection title={title ?? t('weather.title')} testID={testID}>
      <WeatherSummaryContent {...content} />
    </WeatherSection>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  fill: { flex: 1 },
  hours: { flexDirection: 'row', justifyContent: 'space-between' },
  hour: { alignItems: 'center', flex: 1 },
  small: { fontSize: 11, lineHeight: 14 },
});
