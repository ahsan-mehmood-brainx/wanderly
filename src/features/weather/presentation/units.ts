import { type Locale, useLocales } from 'expo-localization';
import { useMemo } from 'react';

export interface WeatherUnits {
  readonly temperature: 'celsius' | 'fahrenheit';
  readonly speed: 'kmh' | 'mph';
}

export const METRIC_UNITS: WeatherUnits = { temperature: 'celsius', speed: 'kmh' };

/**
 * Units the device's region uses: °F where the system says so (US and a few
 * others), mph in the US and UK. Forecasts are stored metric and converted only
 * for display.
 */
export function unitsForLocale(
  locale: Partial<Pick<Locale, 'temperatureUnit' | 'measurementSystem'>> | undefined,
): WeatherUnits {
  return {
    temperature: locale?.temperatureUnit === 'fahrenheit' ? 'fahrenheit' : 'celsius',
    speed: locale?.measurementSystem === 'us' || locale?.measurementSystem === 'uk' ? 'mph' : 'kmh',
  };
}

export function useWeatherUnits(): WeatherUnits {
  const locales = useLocales();
  const primary = locales[0];
  return useMemo(() => unitsForLocale(primary), [primary]);
}
