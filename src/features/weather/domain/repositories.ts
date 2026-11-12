import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';

import { type Coordinates } from './Coordinates';
import { type WeatherForecast } from './Weather';

/** Forecasts from a weather service (Open-Meteo). Every transport failure is mapped into the AppError taxonomy. */
export interface WeatherRepository {
  /** Current conditions, hourly and daily forecast for validated, rounded coordinates. */
  getForecast(location: Coordinates, signal?: AbortSignal): Promise<Result<WeatherForecast, AppError>>;
}

/**
 * Recent forecasts saved on the device, so weather opens instantly after a
 * restart and is still there offline. Never fails: unreadable data is a miss,
 * and a failed save only means the next start has to download again.
 */
export interface WeatherCache {
  load(location: Coordinates): Promise<WeatherForecast | null>;
  save(forecast: WeatherForecast): Promise<void>;
}

/**
 * - `granted`: the app may read the position.
 * - `undetermined`: not asked yet; asking shows the system prompt.
 * - `denied`: refused, but the app may ask again.
 * - `blocked`: refused and the system won't show the prompt again; only Settings can change it.
 */
export type LocationPermission = 'granted' | 'undetermined' | 'denied' | 'blocked';

/** The device's position (expo-location). */
export interface DeviceLocationService {
  /** Current permission, without prompting. */
  getPermission(): Promise<LocationPermission>;
  /** Shows the system prompt when the system allows it; otherwise returns the current state. */
  requestPermission(): Promise<LocationPermission>;
  /**
   * Where the device is, without prompting. Fails with `locationPermissionDenied`
   * without permission, and `locationUnavailable` when location services are off
   * or no position could be determined in time.
   */
  getCurrentPosition(signal?: AbortSignal): Promise<Result<Coordinates, AppError>>;
}
