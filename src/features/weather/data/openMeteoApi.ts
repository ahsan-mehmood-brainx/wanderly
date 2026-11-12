import { type ApiDefinition, ExponentialBackoffRetry, type QueryParams } from '@/core/http';

import { type Coordinates } from '../domain/Coordinates';

/**
 * Open-Meteo forecast API (https://open-meteo.com/en/docs). No key; free for
 * non-commercial use (10 000 calls/day). Data is CC BY 4.0: attribution is
 * shown wherever weather appears.
 *
 * Timeouts are shorter than the app default and there is a single retry: weather
 * is a section of a screen, and a saved forecast (or a clear error with retry)
 * beats a spinner that runs for most of a minute.
 */
export const OPEN_METEO_API: ApiDefinition = {
  name: 'open-meteo',
  baseUrl: 'https://api.open-meteo.com/v1',
  timeoutMs: 10_000,
  retry: new ExponentialBackoffRetry({ maxRetries: 1 }),
};

export const FORECAST_PATH = '/forecast';

/** Today plus six days. */
export const FORECAST_DAYS = 7;

/** Variables for "now" and every hour, so an hour of the forecast can stand in for "now" (see `conditionsAt`). */
export const CONDITION_VARIABLES = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'wind_speed_10m',
  'wind_direction_10m',
  'precipitation_probability',
  'weather_code',
  'is_day',
] as const;

export const DAILY_VARIABLES = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_probability_max',
  'precipitation_sum',
  'uv_index_max',
  'wind_speed_10m_max',
  'sunrise',
  'sunset',
  'daylight_duration',
] as const;

/**
 * - `timezone=auto`: days are split at the location's midnight, not UTC's.
 * - `timeformat=unixtime`: every time is an unambiguous instant. ISO strings would
 *   be local times without an offset, which are easy to misread in another time zone.
 * - Units stay metric (the API default); the UI converts for display, so one
 *   cached forecast serves every unit preference.
 */
export function forecastQuery({ latitude, longitude }: Coordinates): QueryParams {
  return {
    latitude,
    longitude,
    current: CONDITION_VARIABLES.join(','),
    hourly: CONDITION_VARIABLES.join(','),
    daily: DAILY_VARIABLES.join(','),
    timezone: 'auto',
    timeformat: 'unixtime',
    forecast_days: FORECAST_DAYS,
  };
}
