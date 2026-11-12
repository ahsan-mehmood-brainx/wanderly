import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { DeviceWeatherCard } from '@/features/weather/presentation/components/DeviceWeather';
import { useDeviceWeather } from '@/features/weather/presentation/hooks/useDeviceWeather';
import { routes } from '@/shared/navigation/routes';
import { AppEmptyView, Screen } from '@/shared/ui';

interface TripScreenProps {
  /** Already validated by the route. */
  readonly tripId: string;
}

/**
 * Deep-link target for `/trips/:tripId`. Trips don't have destinations yet
 * (trips & itineraries is a later feature), so the weather shown is where the
 * traveller is now; it moves to the trip's destination once trips have one.
 */
export function TripScreen({ tripId }: TripScreenProps) {
  const { t } = useTranslation();
  const weather = useDeviceWeather();

  return (
    <Screen>
      <AppEmptyView
        icon="luggage"
        title={t('trips.tripTitle')}
        message={t('trips.tripMessage', { id: tripId })}
        testID="trip-screen"
      />
      <DeviceWeatherCard
        state={weather}
        onOpenForecast={
          weather.status === 'located' && weather.weather.status === 'ready'
            ? () => router.push(routes.tripWeather(tripId))
            : undefined
        }
      />
    </Screen>
  );
}
