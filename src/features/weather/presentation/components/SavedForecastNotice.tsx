import { useTranslation } from 'react-i18next';

import { isConnectivityError } from '@/core/errors/errorMessages';
import { InlineMessage } from '@/shared/ui';

import { type WeatherReport } from '../../domain/Weather';
import { formatAge } from '../format';

interface SavedForecastNoticeProps {
  readonly report: WeatherReport;
  readonly ageMs: number;
}

/**
 * Says when the weather on screen is a saved copy shown because a new forecast
 * couldn't be downloaded, and how old it is. Nothing is shown for a fresh saved
 * copy: that is just a faster way to show current data.
 */
export function SavedForecastNotice({ report, ageMs }: SavedForecastNoticeProps) {
  const { t } = useTranslation();
  if (report.fallbackReason === null) return null;

  const age = formatAge(ageMs, t);
  return (
    <InlineMessage
      tone="warning"
      icon={isConnectivityError(report.fallbackReason) ? 'offline' : 'history'}
      title={t('weather.savedTitle')}
      message={
        isConnectivityError(report.fallbackReason)
          ? t('weather.savedOffline', { age })
          : t('weather.savedError', { age })
      }
      testID="weather-saved-notice"
    />
  );
}
