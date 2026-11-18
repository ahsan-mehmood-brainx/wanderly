import {
  type DailyForecast,
  type Daylight,
  type HourlyForecast,
  type WeatherConditions,
  type WeatherForecast,
} from './Weather';

export const HOUR_MS = 60 * 60_000;
export const DAY_MS = 24 * HOUR_MS;
const DAY_SECONDS = DAY_MS / 1000;

/** How old `current` may be before the matching hour of the forecast describes "now" better. */
export const CURRENT_MAX_AGE_MS = HOUR_MS;

// ─── Units ───────────────────────────────────────────────────────────────────

export const celsiusToFahrenheit = (celsius: number): number => (celsius * 9) / 5 + 32;

export const kmhToMph = (kmh: number): number => kmh / 1.609344;

/** Rounds for display without producing "-0°". */
export function roundForDisplay(value: number): number {
  const rounded = Math.round(value);
  return rounded === 0 ? 0 : rounded;
}

// ─── Wind ────────────────────────────────────────────────────────────────────

export const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type CompassPoint = (typeof COMPASS_POINTS)[number];

/** Normalises any angle into [0, 360). */
export function normalizeDegrees(degrees: number): number {
  const normalized = ((degrees % 360) + 360) % 360;
  return normalized === 0 ? 0 : normalized;
}

/** The nearest of the 8 compass points (each covers 45°, centred on its bearing). `null` for a missing or non-finite angle. */
export function compassPoint(degrees: number | null): CompassPoint | null {
  if (degrees === null || !Number.isFinite(degrees)) return null;
  const index = Math.round(normalizeDegrees(degrees) / 45) % COMPASS_POINTS.length;
  return COMPASS_POINTS[index] ?? null;
}

// ─── Time zones ──────────────────────────────────────────────────────────────

/**
 * The calendar date (`YYYY-MM-DD`) at a place `utcOffsetSeconds` from UTC.
 * This is what makes "today" mean today *at the destination*: at 23:00 in
 * Lisbon it is already tomorrow in Tokyo.
 */
export function localDateKey(instantMs: number, utcOffsetSeconds: number): string {
  return new Date(instantMs + utcOffsetSeconds * 1000).toISOString().slice(0, 10);
}

/** Whether a forecast's clock differs from the device's, so the UI should say which time zone times are in. */
export function timeZoneDiffers(forecastOffsetSeconds: number, deviceOffsetSeconds: number): boolean {
  return forecastOffsetSeconds !== deviceOffsetSeconds;
}

/** The device's current UTC offset in seconds (east positive, like Open-Meteo; `Date` uses the opposite sign). */
export function deviceUtcOffsetSeconds(now: number): number {
  const offset = -new Date(now).getTimezoneOffset() * 60;
  return offset === 0 ? 0 : offset;
}

// ─── Forecast windows ────────────────────────────────────────────────────────

/** Hours that haven't ended yet, starting with the current one. Past hours (e.g. in an old saved forecast) are skipped. */
export function upcomingHours(hourly: readonly HourlyForecast[], now: number, count = 24): HourlyForecast[] {
  return hourly.filter((hour) => hour.time + HOUR_MS > now).slice(0, count);
}

/** Days from today (at the forecast location) onwards. */
export function upcomingDays(
  daily: readonly DailyForecast[],
  now: number,
  utcOffsetSeconds: number,
  count = 7,
): DailyForecast[] {
  const today = localDateKey(now, utcOffsetSeconds);
  return daily.filter((day) => day.date >= today).slice(0, count);
}

/** The hourly entry whose hour contains `now`, if the forecast covers it. */
export function hourAt(hourly: readonly HourlyForecast[], now: number): HourlyForecast | null {
  return hourly.find((hour) => hour.time <= now && now < hour.time + HOUR_MS) ?? null;
}

/** Takes each missing value from `fallback`. */
function fillMissing(primary: WeatherConditions, fallback: WeatherConditions | null): WeatherConditions {
  if (!fallback) return primary;
  return {
    time: primary.time,
    condition: primary.condition === 'unknown' ? fallback.condition : primary.condition,
    isDay: primary.isDay ?? fallback.isDay,
    temperatureC: primary.temperatureC ?? fallback.temperatureC,
    feelsLikeC: primary.feelsLikeC ?? fallback.feelsLikeC,
    humidityPercent: primary.humidityPercent ?? fallback.humidityPercent,
    windSpeedKmh: primary.windSpeedKmh ?? fallback.windSpeedKmh,
    windDirectionDeg: primary.windDirectionDeg ?? fallback.windDirectionDeg,
    precipitationProbability: primary.precipitationProbability ?? fallback.precipitationProbability,
  };
}

/**
 * The best description of conditions at `now`:
 *
 * 1. `current`, when it is recent, with any missing value taken from the
 *    forecast for this hour.
 * 2. Otherwise the forecast for this hour. A saved forecast opened hours later
 *    (offline) still shows sensible "now" values instead of stale ones.
 * 3. `null` when neither covers `now`.
 */
export function conditionsAt(
  forecast: Pick<WeatherForecast, 'current' | 'hourly'>,
  now: number,
): WeatherConditions | null {
  const hour = hourAt(forecast.hourly, now);
  const { current } = forecast;
  if (current && Math.abs(now - current.time) <= CURRENT_MAX_AGE_MS) return fillMissing(current, hour);
  return hour;
}

// ─── Daylight ────────────────────────────────────────────────────────────────

/**
 * Classifies a day's daylight. Inside the polar circles Open-Meteo reports
 * sunrise = sunset = midnight, so the length of daylight is what tells polar
 * day from polar night.
 */
export function daylightOf(
  sunrise: number | null,
  sunset: number | null,
  daylightDurationSeconds: number | null,
): Daylight | null {
  if (daylightDurationSeconds !== null && Number.isFinite(daylightDurationSeconds)) {
    // Allow a minute of rounding either way.
    if (daylightDurationSeconds >= DAY_SECONDS - 60) return 'polarDay';
    if (daylightDurationSeconds <= 60) return 'polarNight';
  }
  if (sunrise !== null && sunset !== null && sunrise < sunset) return 'normal';
  return null;
}

// ─── Daily temperature ranges ────────────────────────────────────────────────

export interface TemperatureSpan {
  readonly min: number;
  readonly max: number;
}

/** The coldest low and warmest high across the days, ignoring missing values; `null` when there are none. */
export function temperatureSpan(days: readonly DailyForecast[]): TemperatureSpan | null {
  const values = days.flatMap((day) =>
    [day.minTemperatureC, day.maxTemperatureC].filter((value): value is number => value !== null),
  );
  if (values.length === 0) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

/**
 * Where a day's low–high bar sits within the week's span, as fractions in
 * [0, 1] (the familiar "range bar" of weather apps). A day with only one value
 * becomes a point; a week with one temperature fills the track.
 */
export function rangeBarPosition(
  span: TemperatureSpan,
  low: number | null,
  high: number | null,
): { readonly start: number; readonly end: number } | null {
  const from = low ?? high;
  const to = high ?? low;
  if (from === null || to === null) return null;
  const width = span.max - span.min;
  if (width <= 0) return { start: 0, end: 1 };
  const clamp = (value: number) => Math.min(1, Math.max(0, (value - span.min) / width));
  return { start: clamp(Math.min(from, to)), end: clamp(Math.max(from, to)) };
}

// ─── Screen summary ──────────────────────────────────────────────────────────

export interface WeatherSummary {
  /** Conditions now (see {@link conditionsAt}). */
  readonly now: WeatherConditions | null;
  /** Today at the forecast location. */
  readonly today: DailyForecast | null;
  /** The next 24 hours, starting with the current hour. */
  readonly hours: readonly HourlyForecast[];
  /** Today and the following days, up to 7. */
  readonly days: readonly DailyForecast[];
  /** Coldest/warmest across `days`, for range bars. */
  readonly span: TemperatureSpan | null;
  /** How old the forecast is, in ms. */
  readonly ageMs: number;
}

/** Everything a weather screen or card shows, derived from a forecast at `now`. */
export function summarizeForecast(forecast: WeatherForecast, now: number): WeatherSummary {
  const days = upcomingDays(forecast.daily, now, forecast.timeZone.utcOffsetSeconds);
  const today = days[0]?.date === localDateKey(now, forecast.timeZone.utcOffsetSeconds) ? days[0] : null;
  return {
    now: conditionsAt(forecast, now),
    today: today ?? null,
    hours: upcomingHours(forecast.hourly, now),
    days,
    span: temperatureSpan(days),
    ageMs: Math.max(0, now - forecast.fetchedAt),
  };
}
