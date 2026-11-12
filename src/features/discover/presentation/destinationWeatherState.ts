import { type WeatherState } from '@/features/weather/presentation/hooks/useWeather';

import { type DestinationWeatherPlace } from '../domain/Destination';

interface DetailsRetry {
  /** Refetches the destination details, which is where a place's position comes from. */
  readonly retry: () => void;
  readonly refreshing: boolean;
}

/**
 * The weather to show for a destination. When the place's position couldn't be
 * loaded (its Wikipedia summary failed), that failure is shown with a retry of
 * the destination details, instead of the permanent "we don't know where this
 * place is" that a place with no coordinates gets.
 */
export function destinationWeatherState(
  place: DestinationWeatherPlace,
  weather: WeatherState,
  details: DetailsRetry,
): WeatherState {
  if (place.coordinates !== null || place.coordinatesError === null) return weather;
  if (details.refreshing) return { status: 'loading' };
  return { status: 'error', errorKind: place.coordinatesError, retry: details.retry };
}
