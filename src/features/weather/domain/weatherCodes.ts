import { type WeatherCondition } from './Weather';

/**
 * WMO weather interpretation codes (WW) as used by Open-Meteo
 * (https://open-meteo.com/en/docs, "WMO Weather interpretation codes").
 */
const WMO_CONDITIONS: Readonly<Record<number, WeatherCondition>> = {
  0: 'clear',
  1: 'mainlyClear',
  2: 'partlyCloudy',
  3: 'overcast',
  45: 'fog',
  48: 'fog', // depositing rime fog
  51: 'drizzle',
  53: 'drizzle',
  55: 'drizzle',
  56: 'freezingDrizzle',
  57: 'freezingDrizzle',
  61: 'rain',
  63: 'rain',
  65: 'heavyRain',
  66: 'freezingRain',
  67: 'freezingRain',
  71: 'snow',
  73: 'snow',
  75: 'snow',
  77: 'snowGrains',
  80: 'rainShowers',
  81: 'rainShowers',
  82: 'heavyRain', // violent rain showers
  85: 'snowShowers',
  86: 'snowShowers',
  95: 'thunderstorm',
  96: 'thunderstormHail',
  99: 'thunderstormHail',
};

/** Maps a WMO code to a condition; a missing or unrecognised code is `unknown` rather than a guess. */
export function conditionFromWmoCode(code: number | null | undefined): WeatherCondition {
  if (code === null || code === undefined || !Number.isInteger(code)) return 'unknown';
  return WMO_CONDITIONS[code] ?? 'unknown';
}
