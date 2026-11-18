import { type TFunction } from 'i18next';

import { type ForecastTimeZone, type WeatherCondition } from '../domain/Weather';
import {
  celsiusToFahrenheit,
  compassPoint,
  DAY_MS,
  HOUR_MS,
  kmhToMph,
  roundForDisplay,
} from '../domain/weatherCalculations';
import { type WeatherUnits } from './units';

/** "17°" in the user's unit, or the not-available dash. Compact form for cards and lists. */
export function formatTemperature(celsius: number | null, units: WeatherUnits, t: TFunction): string {
  if (celsius === null) return t('weather.notAvailable');
  const value = units.temperature === 'fahrenheit' ? celsiusToFahrenheit(celsius) : celsius;
  return `${roundForDisplay(value)}°`;
}

/** Same as {@link formatTemperature}, but spoken as "not available" instead of a dash. */
export function speakTemperature(celsius: number | null, units: WeatherUnits, t: TFunction): string {
  return celsius === null ? t('weather.notAvailableA11y') : formatTemperature(celsius, units, t);
}

export function formatSpeed(kmh: number | null, units: WeatherUnits, t: TFunction): string {
  if (kmh === null) return t('weather.notAvailable');
  return units.speed === 'mph'
    ? t('weather.units.mph', { value: roundForDisplay(kmhToMph(kmh)) })
    : t('weather.units.kmh', { value: roundForDisplay(kmh) });
}

export function formatPercent(value: number | null, language: string, t: TFunction): string {
  if (value === null) return t('weather.notAvailable');
  try {
    return new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 0 }).format(value / 100);
  } catch {
    return `${Math.round(value)}%`;
  }
}

export function speakPercent(value: number | null, language: string, t: TFunction): string {
  return value === null ? t('weather.notAvailableA11y') : formatPercent(value, language, t);
}

export function formatMillimetres(value: number | null, language: string, t: TFunction): string {
  if (value === null) return t('weather.notAvailable');
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value);
  } catch {
    formatted = value.toFixed(1);
  }
  return t('weather.units.mm', { value: formatted });
}

export function formatUvIndex(value: number | null, language: string, t: TFunction): string {
  if (value === null) return t('weather.notAvailable');
  try {
    return new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(value);
  } catch {
    return String(Math.round(value));
  }
}

/** "13 km/h NW". */
export function formatWind(
  speedKmh: number | null,
  directionDeg: number | null,
  units: WeatherUnits,
  t: TFunction,
): string {
  const speed = formatSpeed(speedKmh, units, t);
  const point = compassPoint(directionDeg);
  return speedKmh !== null && point
    ? t('weather.windFrom', { speed, direction: t(`weather.compass.${point}`) })
    : speed;
}

/** "13 km/h from the northwest", for screen readers. */
export function speakWind(
  speedKmh: number | null,
  directionDeg: number | null,
  units: WeatherUnits,
  t: TFunction,
): string {
  if (speedKmh === null) return t('weather.notAvailableA11y');
  const speed = formatSpeed(speedKmh, units, t);
  const point = compassPoint(directionDeg);
  return point ? t('weather.windFromA11y', { speed, direction: t(`weather.compassLong.${point}`) }) : speed;
}

export const conditionLabel = (condition: WeatherCondition, t: TFunction): string =>
  t(`weather.conditions.${condition}`);

/**
 * Formats an instant on the forecast location's clock. The IANA zone is used
 * when the engine knows it (correct across daylight-saving changes); otherwise
 * the instant is shifted by the forecast's UTC offset and formatted as UTC.
 */
export function formatInZone(
  instant: number,
  zone: ForecastTimeZone,
  language: string,
  options: Intl.DateTimeFormatOptions,
): string {
  if (zone.id) {
    try {
      return new Intl.DateTimeFormat(language, { ...options, timeZone: zone.id }).format(instant);
    } catch {
      // Unknown zone on this engine; fall through to the fixed offset.
    }
  }
  const shifted = instant + zone.utcOffsetSeconds * 1000;
  try {
    return new Intl.DateTimeFormat(language, { ...options, timeZone: 'UTC' }).format(shifted);
  } catch {
    return new Date(shifted).toISOString().slice(11, 16);
  }
}

/** "2:00 PM" / "14:00" at the location. */
export const formatClockTime = (instant: number, zone: ForecastTimeZone, language: string): string =>
  formatInZone(instant, zone, language, { hour: 'numeric', minute: '2-digit' });

/** "Thu" / "jue" at the location. */
export const formatWeekday = (instant: number, zone: ForecastTimeZone, language: string): string =>
  formatInZone(instant, zone, language, { weekday: 'short' });

/** "Thursday, November 12", for screen readers. */
export const formatLongDay = (instant: number, zone: ForecastTimeZone, language: string): string =>
  formatInZone(instant, zone, language, { weekday: 'long', month: 'long', day: 'numeric' });

/** "JST", "GMT+1", or "UTC+05:30" when the service sent neither an abbreviation nor a zone. */
export function zoneLabel(zone: ForecastTimeZone): string {
  if (zone.abbreviation) return zone.abbreviation;
  if (zone.id) return zone.id;
  const total = Math.abs(zone.utcOffsetSeconds) / 60;
  const sign = zone.utcOffsetSeconds < 0 ? '-' : '+';
  const hours = String(Math.floor(total / 60)).padStart(2, '0');
  const minutes = String(Math.round(total % 60)).padStart(2, '0');
  return `UTC${sign}${hours}:${minutes}`;
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago". */
export function formatAge(ageMs: number, t: TFunction): string {
  if (ageMs < 60_000) return t('weather.age.justNow');
  if (ageMs < HOUR_MS) return t('weather.age.minutes', { count: Math.floor(ageMs / 60_000) });
  if (ageMs < DAY_MS) return t('weather.age.hours', { count: Math.floor(ageMs / HOUR_MS) });
  return t('weather.age.days', { count: Math.floor(ageMs / DAY_MS) });
}
