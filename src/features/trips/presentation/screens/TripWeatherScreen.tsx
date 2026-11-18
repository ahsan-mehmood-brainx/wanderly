import { DeviceWeatherView } from '@/features/weather/presentation/components/DeviceWeather';
import { useDeviceWeather } from '@/features/weather/presentation/hooks/useDeviceWeather';

/** Full forecast opened from a trip: for now, where the traveller is (see `TripScreen`). */
export function TripWeatherScreen() {
  return <DeviceWeatherView state={useDeviceWeather()} />;
}
