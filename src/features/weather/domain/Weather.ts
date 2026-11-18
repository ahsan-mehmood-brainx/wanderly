import { type AppErrorKind } from '@/core/errors/AppError';

import { type Coordinates } from './Coordinates';

/** What the sky is doing, grouped from WMO weather codes (see `weatherCodes.ts`). */
export const WEATHER_CONDITIONS = [
  'clear',
  'mainlyClear',
  'partlyCloudy',
  'overcast',
  'fog',
  'drizzle',
  'freezingDrizzle',
  'rain',
  'heavyRain',
  'freezingRain',
  'snow',
  'snowGrains',
  'rainShowers',
  'snowShowers',
  'thunderstorm',
  'thunderstormHail',
  /** The code was missing or isn't one the app knows. */
  'unknown',
] as const;
export type WeatherCondition = (typeof WEATHER_CONDITIONS)[number];

/**
 * Conditions at one moment (now, or one hour of the forecast).
 *
 * Every measurement can be missing: not every model provides every variable
 * everywhere. `null` means "not available" and is shown that way, never as zero.
 * Values are metric (°C, km/h); the UI converts for display.
 */
export interface WeatherConditions {
  /** The instant this applies to, in epoch milliseconds (UTC). */
  readonly time: number;
  readonly condition: WeatherCondition;
  /** `null` when unknown; icons then use the daytime variant. */
  readonly isDay: boolean | null;
  readonly temperatureC: number | null;
  /** Apparent temperature: wind chill and humidity included. */
  readonly feelsLikeC: number | null;
  readonly humidityPercent: number | null;
  readonly windSpeedKmh: number | null;
  /** Meteorological convention: the direction the wind blows *from*, 0–360° clockwise from north. */
  readonly windDirectionDeg: number | null;
  /** Chance of precipitation, 0–100. */
  readonly precipitationProbability: number | null;
}

export type HourlyForecast = WeatherConditions;

/**
 * - `normal`: the sun rises and sets.
 * - `polarDay`: the sun never sets (midnight sun).
 * - `polarNight`: the sun never rises.
 */
export type Daylight = 'normal' | 'polarDay' | 'polarNight';

export interface DailyForecast {
  /** Calendar date at the forecast location, `YYYY-MM-DD`. */
  readonly date: string;
  /** Local midnight at the location, as an instant (epoch ms). */
  readonly time: number;
  readonly condition: WeatherCondition;
  readonly maxTemperatureC: number | null;
  readonly minTemperatureC: number | null;
  /** Highest hourly chance of precipitation that day, 0–100. */
  readonly precipitationProbability: number | null;
  readonly precipitationMm: number | null;
  readonly uvIndexMax: number | null;
  readonly windSpeedMaxKmh: number | null;
  /** Epoch ms. `null` on polar days/nights, or when unknown. */
  readonly sunrise: number | null;
  readonly sunset: number | null;
  readonly daylight: Daylight | null;
}

/**
 * The forecast location's time zone. Times in a forecast are instants; the UI
 * shows them in this zone (a trip to Tokyo shows Tokyo's 9:00, not the phone's).
 */
export interface ForecastTimeZone {
  /** IANA name ("Asia/Tokyo"); `null` when the service didn't provide one. */
  readonly id: string | null;
  /** "JST", "GMT+1". */
  readonly abbreviation: string | null;
  /** Offset from UTC when the forecast was made. */
  readonly utcOffsetSeconds: number;
}

export interface WeatherForecast {
  /** The (rounded) coordinates the forecast was requested for. */
  readonly location: Coordinates;
  readonly timeZone: ForecastTimeZone;
  /** Latest observation-like model state; `null` when the service sent none. */
  readonly current: WeatherConditions | null;
  /** Ascending by time. */
  readonly hourly: readonly HourlyForecast[];
  /** Ascending by date. */
  readonly daily: readonly DailyForecast[];
  /** When the forecast was downloaded (epoch ms). */
  readonly fetchedAt: number;
}

/** `network`: downloaded just now. `cache`: a copy saved on the device. */
export type ForecastSource = 'network' | 'cache';

export interface WeatherReport {
  readonly forecast: WeatherForecast;
  readonly source: ForecastSource;
  /**
   * Why a saved forecast is shown instead of a new one (`offline`, `timeout`,
   * `server`…). `null` when the forecast is from the network, or when the saved
   * copy was simply still fresh.
   */
  readonly fallbackReason: AppErrorKind | null;
}
