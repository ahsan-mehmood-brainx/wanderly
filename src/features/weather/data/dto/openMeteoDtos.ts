import { z } from 'zod';

/**
 * Open-Meteo `/v1/forecast` response with `timeformat=unixtime`
 * (https://open-meteo.com/en/docs).
 *
 * Models don't provide every variable everywhere, and a value can be `null` for
 * single hours. So every measurement is optional and falls back on its own
 * (`.catch`): one bad value blanks that value, not the hour, day or forecast.
 * Only the coordinates are required; an error body (`{ error: true, reason }`)
 * lacks them and fails validation as a `parse` error.
 */
const measurement = z.number().nullish().catch(null);
/** One value per time step; element-wise fallback keeps the arrays aligned with `time`. */
const series = z.array(z.number().nullable().catch(null)).nullish().catch(null);
const optionalText = z.string().trim().min(1).nullish().catch(null);

export const currentDtoSchema = z.object({
  /** Seconds since the epoch. */
  time: z.number(),
  temperature_2m: measurement,
  apparent_temperature: measurement,
  relative_humidity_2m: measurement,
  wind_speed_10m: measurement,
  wind_direction_10m: measurement,
  precipitation_probability: measurement,
  weather_code: measurement,
  is_day: measurement,
});
export type CurrentDto = z.infer<typeof currentDtoSchema>;

export const hourlyDtoSchema = z.object({
  time: z.array(z.number()),
  temperature_2m: series,
  apparent_temperature: series,
  relative_humidity_2m: series,
  wind_speed_10m: series,
  wind_direction_10m: series,
  precipitation_probability: series,
  weather_code: series,
  is_day: series,
});
export type HourlyDto = z.infer<typeof hourlyDtoSchema>;

export const dailyDtoSchema = z.object({
  /** Local midnight of each day, as seconds since the epoch. */
  time: z.array(z.number()),
  weather_code: series,
  temperature_2m_max: series,
  temperature_2m_min: series,
  precipitation_probability_max: series,
  precipitation_sum: series,
  uv_index_max: series,
  wind_speed_10m_max: series,
  sunrise: series,
  sunset: series,
  /** Seconds of daylight. */
  daylight_duration: series,
});
export type DailyDto = z.infer<typeof dailyDtoSchema>;

export const forecastDtoSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  /** IANA zone resolved from the coordinates (`timezone=auto`). */
  timezone: optionalText,
  timezone_abbreviation: optionalText,
  utc_offset_seconds: z.number().int().catch(0),
  current: currentDtoSchema.nullish().catch(null),
  hourly: hourlyDtoSchema.nullish().catch(null),
  daily: dailyDtoSchema.nullish().catch(null),
});
export type ForecastDto = z.infer<typeof forecastDtoSchema>;
