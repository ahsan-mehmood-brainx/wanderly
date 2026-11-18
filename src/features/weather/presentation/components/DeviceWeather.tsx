import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { getErrorMessageKey } from '@/core/errors/errorMessages';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppButton, AppEmptyView, AppErrorView, AppLoader, AppText, InlineMessage } from '@/shared/ui';

import { type DeviceWeatherState } from '../hooks/useDeviceWeather';
import { WeatherForecastView } from './WeatherForecastView';
import { WeatherSummaryContent } from './WeatherSummaryCard';
import { WeatherSection } from './WeatherSection';

/** "Open Settings" with an inline error if the system refuses to open them. */
function OpenSettingsButton({ openSettings }: { openSettings: () => Promise<boolean> }) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const [failed, setFailed] = useState(false);
  return (
    <View style={{ gap: spacing.sm }}>
      <AppButton
        label={t('weather.device.openSettings')}
        variant="outline"
        size="sm"
        leftIcon="settings"
        onPress={() => void openSettings().then((opened) => setFailed(!opened))}
      />
      {failed ? <InlineMessage tone="danger" icon="error" message={t('weather.device.openSettingsFailed')} /> : null}
    </View>
  );
}

interface DeviceWeatherCardProps {
  readonly state: DeviceWeatherState;
  readonly onOpenForecast?: () => void;
}

/** "Weather where you are" card: asks for location with context, then shows the compact forecast. */
export function DeviceWeatherCard({ state, onOpenForecast }: DeviceWeatherCardProps) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();

  let content;
  switch (state.status) {
    case 'checking':
      content = <AppLoader size="small" />;
      break;
    case 'needsPermission':
      content = (
        <View style={{ gap: spacing.md }}>
          <AppText color="textSecondary">{t('weather.device.prompt')}</AppText>
          <AppButton
            label={t('weather.device.allow')}
            leftIcon="myLocation"
            size="sm"
            loading={state.requesting}
            onPress={state.request}
            testID="weather-allow-location"
          />
        </View>
      );
      break;
    case 'blocked':
      content = (
        <View style={{ gap: spacing.md }}>
          <AppText color="textSecondary">{t('weather.device.deniedMessage')}</AppText>
          <OpenSettingsButton openSettings={state.openSettings} />
        </View>
      );
      break;
    case 'locating':
      content = <AppLoader size="small" label={t('weather.device.locating')} testID="weather-locating" />;
      break;
    case 'locationError':
      content = (
        <View style={{ gap: spacing.md }}>
          <InlineMessage tone="warning" icon="location" message={t(getErrorMessageKey(state.errorKind))} />
          <AppButton
            label={t('common.tryAgain')}
            variant="outline"
            size="sm"
            leftIcon="refresh"
            onPress={state.retry}
          />
        </View>
      );
      break;
    case 'located':
      content = (
        <WeatherSummaryContent
          state={state.weather}
          placeName={t('weather.device.yourLocation')}
          onOpenForecast={onOpenForecast}
        />
      );
      break;
  }

  return (
    <WeatherSection title={t('weather.device.title')} testID="device-weather-card">
      {content}
    </WeatherSection>
  );
}

/** Full-screen version for the forecast screen opened from a trip. */
export function DeviceWeatherView({ state }: { readonly state: DeviceWeatherState }) {
  const { t } = useTranslation();
  const [openSettingsFailed, setOpenSettingsFailed] = useState(false);

  switch (state.status) {
    case 'checking':
      return <AppLoader fullScreen />;
    case 'needsPermission':
      return (
        <AppEmptyView
          fullScreen
          icon="myLocation"
          title={t('weather.device.title')}
          message={t('weather.device.prompt')}
          actionLabel={t('weather.device.allow')}
          onAction={state.request}
        />
      );
    case 'blocked':
      return (
        <AppEmptyView
          fullScreen
          icon="location"
          title={t('weather.device.title')}
          message={
            openSettingsFailed
              ? `${t('weather.device.deniedMessage')}\n\n${t('weather.device.openSettingsFailed')}`
              : t('weather.device.deniedMessage')
          }
          actionLabel={t('weather.device.openSettings')}
          onAction={() => void state.openSettings().then((opened) => setOpenSettingsFailed(!opened))}
          testID="device-weather-blocked"
        />
      );
    case 'locating':
      return <AppLoader fullScreen label={t('weather.device.locating')} />;
    case 'locationError':
      return (
        <AppErrorView
          fullScreen
          icon="location"
          title={t('weather.unavailable.title')}
          errorKind={state.errorKind}
          onRetry={state.retry}
        />
      );
    case 'located':
      return <WeatherForecastView state={state.weather} placeName={t('weather.device.yourLocation')} />;
  }
}
