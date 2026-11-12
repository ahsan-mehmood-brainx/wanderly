import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { getErrorMessageKey } from '@/core/errors/errorMessages';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppErrorView, AppLoader, AppText } from '@/shared/ui';

import { deviceUtcOffsetSeconds, localDateKey, timeZoneDiffers } from '../../domain/weatherCalculations';
import { zoneLabel } from '../format';
import { type WeatherState } from '../hooks/useWeather';
import { useWeatherUnits } from '../units';
import { CurrentConditions } from './CurrentConditions';
import { DailyForecastList } from './DailyForecastList';
import { HourlyForecastStrip } from './HourlyForecastStrip';
import { SavedForecastNotice } from './SavedForecastNotice';
import { WeatherDetailsGrid } from './WeatherDetailsGrid';
import { WeatherSection } from './WeatherSection';

interface WeatherForecastViewProps {
  readonly state: WeatherState;
  readonly placeName: string;
  /** Extra context under the forecast, e.g. "Forecast for the centre of Portugal." */
  readonly note?: string | null;
  /** Replaces the generic "location unavailable" copy (a destination without coordinates vs a device without a fix). */
  readonly noLocationMessage?: string;
}

/** The full weather screen body: hero, hourly carousel, 7-day forecast and details, with pull to refresh. */
export function WeatherForecastView({ state, placeName, note, noLocationMessage }: WeatherForecastViewProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useAppTheme();
  const units = useWeatherUnits();

  if (state.status === 'loading') {
    return <AppLoader fullScreen label={t('weather.loading')} testID="weather-loading" />;
  }
  if (state.status === 'error') {
    const noLocation = state.errorKind === 'locationUnavailable' || state.errorKind === 'invalidLocation';
    return (
      <AppErrorView
        fullScreen
        errorKind={state.errorKind}
        title={noLocation ? t('weather.unavailable.title') : undefined}
        icon={noLocation ? 'location' : undefined}
        message={
          state.errorKind === 'locationUnavailable' && noLocationMessage
            ? noLocationMessage
            : t(getErrorMessageKey(state.errorKind))
        }
        onRetry={state.retry ?? undefined}
        testID="weather-error"
      />
    );
  }

  const { report, summary, now, refreshing, refresh } = state;
  const { timeZone } = report.forecast;
  const showZone = timeZoneDiffers(timeZone.utcOffsetSeconds, deviceUtcOffsetSeconds(now));

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={[styles.fill, { backgroundColor: colors.background }]}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      testID="weather-forecast"
    >
      <SavedForecastNotice report={report} ageMs={summary.ageMs} />
      {summary.now === null && summary.days.length === 0 ? (
        <AppText color="textSecondary">{t('weather.noForecast')}</AppText>
      ) : null}
      <CurrentConditions placeName={placeName} summary={summary} timeZone={timeZone} units={units} now={now} />

      <WeatherSection title={t('weather.hourlyTitle')}>
        <HourlyForecastStrip hours={summary.hours} timeZone={timeZone} units={units} now={now} />
      </WeatherSection>

      <WeatherSection title={t('weather.dailyTitle')}>
        <DailyForecastList
          days={summary.days}
          todayDate={localDateKey(now, timeZone.utcOffsetSeconds)}
          span={summary.span}
          timeZone={timeZone}
          units={units}
        />
      </WeatherSection>

      <WeatherSection title={t('weather.detailsTitle')}>
        <WeatherDetailsGrid summary={summary} timeZone={timeZone} units={units} />
      </WeatherSection>

      {note ? (
        <AppText variant="caption" color="textSecondary">
          {note}
        </AppText>
      ) : null}
      {showZone ? (
        <AppText variant="caption" color="textSecondary" testID="weather-local-time">
          {t('weather.localTime', { zone: zoneLabel(timeZone) })}
        </AppText>
      ) : null}
      <AppText variant="caption" color="textTertiary">
        {t('weather.attribution')}
      </AppText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
