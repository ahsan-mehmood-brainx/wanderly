import { type ForecastDto } from '@/features/weather/data/dto/openMeteoDtos';
import { OPEN_METEO_API } from '@/features/weather/data/openMeteoApi';

import { apiSuccess, type FakeHttpClient, type FakeHttpClientFactory } from './FakeHttpClient';

/** 2026-11-12 10:30 UTC: a Thursday. Tests set their clock here. */
export const WEATHER_NOW = Date.UTC(2026, 10, 12, 10, 30);

const HOUR_S = 3600;
const DAY_S = 24 * HOUR_S;

export interface ForecastFixtureOptions {
  /** Instant the forecast is built around (ms). */
  readonly now?: number;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly timezone?: string | null;
  readonly abbreviation?: string | null;
  readonly utcOffsetSeconds?: number;
  readonly days?: number;
}

/**
 * An Open-Meteo response in the wire format the app requests
 * (`timeformat=unixtime`, `timezone=auto`), starting at local midnight of the
 * day containing `now`, like the real API. Values follow a simple, readable
 * pattern: hour h of day d is `10 + d + h / 2` °C, codes cycle clear → rain.
 */
export function forecastDto(options: ForecastFixtureOptions = {}): ForecastDto {
  const {
    now = WEATHER_NOW,
    latitude = 38.72,
    longitude = -9.14,
    timezone = 'Europe/Lisbon',
    abbreviation = 'GMT',
    utcOffsetSeconds = 0,
    days = 7,
  } = options;
  const nowS = Math.floor(now / 1000);
  // Local midnight of today at the location, as an instant.
  const midnight = Math.floor((nowS + utcOffsetSeconds) / DAY_S) * DAY_S - utcOffsetSeconds;
  const hours = Array.from({ length: days * 24 }, (_, index) => midnight + index * HOUR_S);
  const dayStarts = Array.from({ length: days }, (_, index) => midnight + index * DAY_S);
  const hourTemp = (index: number) => 10 + Math.floor(index / 24) + (index % 24) / 2;
  const codes = [0, 1, 2, 3, 61];
  const currentTime = Math.floor(nowS / 900) * 900;
  const currentIndex = Math.floor((currentTime - midnight) / HOUR_S);

  return {
    latitude,
    longitude,
    timezone,
    timezone_abbreviation: abbreviation,
    utc_offset_seconds: utcOffsetSeconds,
    current: {
      time: currentTime,
      temperature_2m: hourTemp(currentIndex),
      apparent_temperature: hourTemp(currentIndex) - 1,
      relative_humidity_2m: 72,
      wind_speed_10m: 14.4,
      wind_direction_10m: 315,
      precipitation_probability: 20,
      weather_code: 2,
      is_day: 1,
    },
    hourly: {
      time: hours,
      temperature_2m: hours.map((_, index) => hourTemp(index)),
      apparent_temperature: hours.map((_, index) => hourTemp(index) - 1),
      relative_humidity_2m: hours.map(() => 70),
      wind_speed_10m: hours.map(() => 12),
      wind_direction_10m: hours.map(() => 180),
      precipitation_probability: hours.map((_, index) => (index % 24) * 4),
      weather_code: hours.map((_, index) => codes[index % codes.length] ?? 0),
      is_day: hours.map((_, index) => (index % 24 >= 7 && index % 24 < 18 ? 1 : 0)),
    },
    daily: {
      time: dayStarts,
      weather_code: dayStarts.map((_, index) => codes[index % codes.length] ?? 0),
      temperature_2m_max: dayStarts.map((_, index) => 22 + index),
      temperature_2m_min: dayStarts.map((_, index) => 10 + index),
      precipitation_probability_max: dayStarts.map((_, index) => index * 10),
      precipitation_sum: dayStarts.map((_, index) => index * 0.5),
      uv_index_max: dayStarts.map(() => 3.7),
      wind_speed_10m_max: dayStarts.map(() => 25),
      sunrise: dayStarts.map((start) => start + 7 * HOUR_S + 30 * 60),
      sunset: dayStarts.map((start) => start + 17 * HOUR_S + 15 * 60),
      daylight_duration: dayStarts.map(() => 9.75 * HOUR_S),
    },
  };
}

/** Answers every Open-Meteo forecast request with `dto` (a valid forecast by default). */
export function stubWeatherApi(factory: FakeHttpClientFactory, dto: unknown = forecastDto()): FakeHttpClient {
  return factory.client(OPEN_METEO_API.name).on('GET', '/forecast', apiSuccess(dto));
}
