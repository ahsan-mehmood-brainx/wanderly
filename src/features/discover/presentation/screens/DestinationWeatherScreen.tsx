import { useTranslation } from 'react-i18next';

import { WeatherForecastView } from '@/features/weather/presentation/components/WeatherForecastView';
import { useWeather } from '@/features/weather/presentation/hooks/useWeather';
import { AppErrorView, AppLoader } from '@/shared/ui';

import { destinationWeatherPlace } from '../../domain/Destination';
import { destinationWeatherState } from '../destinationWeatherState';
import { queryErrorKind, useDestinationDetailsQuery } from '../state/discoverApi';

interface DestinationWeatherScreenProps {
  /** Already validated by the route (shape); parsed strictly by the use case. */
  readonly destinationId: string;
}

/**
 * Full forecast for a destination. The destination comes from the RTK Query
 * cache when the user arrives from its page, so only the forecast may need a
 * request; a deep link loads both.
 */
export function DestinationWeatherScreen({ destinationId }: DestinationWeatherScreenProps) {
  const { t } = useTranslation();
  const destination = useDestinationDetailsQuery(destinationId);
  const details = destination.currentData;
  const place = details ? destinationWeatherPlace(details) : null;
  // Called unconditionally (rules of hooks); with no destination yet it makes no request.
  const weather = useWeather(place?.coordinates);
  const retryDetails = () => void destination.refetch();

  if (!details || !place) {
    const errorKind = queryErrorKind(destination.error);
    if (errorKind && !destination.isFetching) {
      return (
        <AppErrorView
          fullScreen
          errorKind={errorKind}
          onRetry={errorKind === 'notFound' ? undefined : retryDetails}
          testID="destination-weather-error"
        />
      );
    }
    return <AppLoader fullScreen label={t('weather.loading')} />;
  }

  return (
    <WeatherForecastView
      state={destinationWeatherState(place, weather, { retry: retryDetails, refreshing: destination.isFetching })}
      placeName={place.name}
      note={place.precision === 'country' ? t('weather.countryCentre', { country: place.name }) : null}
      noLocationMessage={t('weather.unavailable.noCoordinates')}
    />
  );
}
