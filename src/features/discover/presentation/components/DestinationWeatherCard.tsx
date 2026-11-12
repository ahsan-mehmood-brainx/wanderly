import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { WeatherSummaryCard } from '@/features/weather/presentation/components/WeatherSummaryCard';
import { useWeather } from '@/features/weather/presentation/hooks/useWeather';
import { routes } from '@/shared/navigation/routes';

import { type DestinationDetails, destinationWeatherPlace } from '../../domain/Destination';
import { destinationWeatherState } from '../destinationWeatherState';

interface DestinationWeatherCardProps {
  readonly details: DestinationDetails;
  /** Refetches the destination details (a place's position comes from its Wikipedia summary). */
  readonly onRetryDetails: () => void;
  readonly refreshingDetails: boolean;
}

/** Current weather and the next hours at a destination, linking to its full forecast. */
export function DestinationWeatherCard({ details, onRetryDetails, refreshingDetails }: DestinationWeatherCardProps) {
  const { t } = useTranslation();
  const place = destinationWeatherPlace(details);
  const weather = destinationWeatherState(place, useWeather(place.coordinates), {
    retry: onRetryDetails,
    refreshing: refreshingDetails,
  });

  return (
    <WeatherSummaryCard
      state={weather}
      placeName={place.name}
      note={place.precision === 'country' ? t('weather.countryCentre', { country: place.name }) : null}
      noLocationMessage={t('weather.unavailable.noCoordinates')}
      onOpenForecast={weather.status === 'ready' ? () => router.push(routes.destinationWeather(details.id)) : undefined}
    />
  );
}
