import { type Locale } from 'expo-localization';
import { type TFunction } from 'i18next';

export type DistanceUnits = 'metric' | 'imperial';

const METRES_PER_MILE = 1_609.344;
const FEET_PER_METRE = 3.28084;

/** Miles where the device's region measures in miles (US, UK), kilometres elsewhere. */
export function distanceUnitsForLocale(locale: Partial<Pick<Locale, 'measurementSystem'>> | undefined): DistanceUnits {
  return locale?.measurementSystem === 'us' || locale?.measurementSystem === 'uk' ? 'imperial' : 'metric';
}

function formatNumber(value: number, language: string, maximumFractionDigits: number): string {
  try {
    return new Intl.NumberFormat(language, { maximumFractionDigits }).format(value);
  } catch {
    return value.toFixed(maximumFractionDigits);
  }
}

/** "350 m" / "1.2 km", or "500 ft" / "0.8 mi": rounded, since the distance is straight-line anyway. */
export function formatDistance(meters: number, units: DistanceUnits, language: string, t: TFunction): string {
  if (units === 'imperial') {
    const miles = meters / METRES_PER_MILE;
    if (miles < 0.1) {
      return t('map.distance.ft', {
        value: formatNumber(Math.round((meters * FEET_PER_METRE) / 10) * 10, language, 0),
      });
    }
    return t('map.distance.mi', { value: formatNumber(miles, language, 1) });
  }
  // Round first: 995 m would otherwise show as "1,000 m" instead of "1 km".
  const roundedMeters = Math.round(meters / 10) * 10;
  if (roundedMeters < 1_000) return t('map.distance.m', { value: formatNumber(roundedMeters, language, 0) });
  return t('map.distance.km', { value: formatNumber(meters / 1_000, language, 1) });
}
