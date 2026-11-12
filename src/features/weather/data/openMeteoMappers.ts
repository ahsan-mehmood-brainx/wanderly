import { type Coordinates } from '../domain/Coordinates';
import {
  type DailyForecast,
  type ForecastTimeZone,
  type HourlyForecast,
  type WeatherConditions,
  type WeatherForecast,
} from '../domain/Weather';
import { daylightOf, localDateKey, normalizeDegrees } from '../domain/weatherCalculations';
import { conditionFromWmoCode } from '../domain/weatherCodes';
import { type CurrentDto, type DailyDto, type ForecastDto, type HourlyDto } from './dto/openMeteoDtos';

type Series = readonly (number | null)[] | null | undefined;

/** The value at `index`, or `null` when the series is missing or shorter than `time`. */
const at = (series: Series, index: number): number | null => series?.[index] ?? null;

const toMs = (seconds: number): number => seconds * 1000;

const percentage = (value: number | null): number | null => (value === null ? null : Math.min(100, Math.max(0, value)));

/** Speeds, amounts and the UV index can't be negative; a negative value is a bad reading, not zero. */
const nonNegative = (value: number | null): number | null => (value === null || value < 0 ? null : value);

const direction = (value: number | null): number | null => (value === null ? null : normalizeDegrees(value));

const dayFlag = (value: number | null): boolean | null => (value === 1 ? true : value === 0 ? false : null);

interface ConditionValues {
  readonly time: number;
  readonly temperature: number | null;
  readonly apparent: number | null;
  readonly humidity: number | null;
  readonly windSpeed: number | null;
  readonly windDirection: number | null;
  readonly precipitationProbability: number | null;
  readonly code: number | null;
  readonly isDay: number | null;
}

function toConditions(values: ConditionValues): WeatherConditions {
  return {
    time: toMs(values.time),
    condition: conditionFromWmoCode(values.code),
    isDay: dayFlag(values.isDay),
    temperatureC: values.temperature,
    feelsLikeC: values.apparent,
    humidityPercent: percentage(values.humidity),
    windSpeedKmh: nonNegative(values.windSpeed),
    windDirectionDeg: direction(values.windDirection),
    precipitationProbability: percentage(values.precipitationProbability),
  };
}

export function toCurrentConditions(dto: CurrentDto): WeatherConditions {
  return toConditions({
    time: dto.time,
    temperature: dto.temperature_2m ?? null,
    apparent: dto.apparent_temperature ?? null,
    humidity: dto.relative_humidity_2m ?? null,
    windSpeed: dto.wind_speed_10m ?? null,
    windDirection: dto.wind_direction_10m ?? null,
    precipitationProbability: dto.precipitation_probability ?? null,
    code: dto.weather_code ?? null,
    isDay: dto.is_day ?? null,
  });
}

/** Ascending and one entry per instant, whatever order the payload used. */
function sortedUnique<T extends { readonly time: number }>(entries: readonly T[]): T[] {
  const byTime = new Map<number, T>();
  for (const entry of entries) if (!byTime.has(entry.time)) byTime.set(entry.time, entry);
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

export function toHourlyForecast(dto: HourlyDto): HourlyForecast[] {
  return sortedUnique(
    dto.time.map((time, index) =>
      toConditions({
        time,
        temperature: at(dto.temperature_2m, index),
        apparent: at(dto.apparent_temperature, index),
        humidity: at(dto.relative_humidity_2m, index),
        windSpeed: at(dto.wind_speed_10m, index),
        windDirection: at(dto.wind_direction_10m, index),
        precipitationProbability: at(dto.precipitation_probability, index),
        code: at(dto.weather_code, index),
        isDay: at(dto.is_day, index),
      }),
    ),
  );
}

export function toDailyForecast(dto: DailyDto, utcOffsetSeconds: number): DailyForecast[] {
  return sortedUnique(
    dto.time.map((time, index): DailyForecast => {
      const sunriseSeconds = at(dto.sunrise, index);
      const sunsetSeconds = at(dto.sunset, index);
      const sunrise = sunriseSeconds === null ? null : toMs(sunriseSeconds);
      const sunset = sunsetSeconds === null ? null : toMs(sunsetSeconds);
      const daylight = daylightOf(sunrise, sunset, at(dto.daylight_duration, index));
      // On polar days and nights both times are reported as midnight; they aren't real events.
      const hasSunEvents = daylight === 'normal';
      const max = at(dto.temperature_2m_max, index);
      const min = at(dto.temperature_2m_min, index);

      return {
        date: localDateKey(toMs(time), utcOffsetSeconds),
        time: toMs(time),
        condition: conditionFromWmoCode(at(dto.weather_code, index)),
        // Some models swap or duplicate extremes at boundaries; keep low ≤ high.
        maxTemperatureC: max !== null && min !== null ? Math.max(max, min) : max,
        minTemperatureC: max !== null && min !== null ? Math.min(max, min) : min,
        precipitationProbability: percentage(at(dto.precipitation_probability_max, index)),
        precipitationMm: nonNegative(at(dto.precipitation_sum, index)),
        uvIndexMax: nonNegative(at(dto.uv_index_max, index)),
        windSpeedMaxKmh: nonNegative(at(dto.wind_speed_10m_max, index)),
        sunrise: hasSunEvents ? sunrise : null,
        sunset: hasSunEvents ? sunset : null,
        daylight,
      };
    }),
  );
}

export function toTimeZone(
  dto: Pick<ForecastDto, 'timezone' | 'timezone_abbreviation' | 'utc_offset_seconds'>,
): ForecastTimeZone {
  return {
    id: dto.timezone ?? null,
    abbreviation: dto.timezone_abbreviation ?? null,
    utcOffsetSeconds: dto.utc_offset_seconds,
  };
}

/**
 * Maps the API response to a forecast for the *requested* coordinates. The
 * service snaps to its model grid and echoes those coordinates back; keeping the
 * requested ones means the forecast is found again under the same cache key.
 */
export function toWeatherForecast(dto: ForecastDto, requested: Coordinates, fetchedAt: number): WeatherForecast {
  return {
    location: requested,
    timeZone: toTimeZone(dto),
    current: dto.current ? toCurrentConditions(dto.current) : null,
    hourly: dto.hourly ? toHourlyForecast(dto.hourly) : [],
    daily: dto.daily ? toDailyForecast(dto.daily, dto.utc_offset_seconds) : [],
    fetchedAt,
  };
}
