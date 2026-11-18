import { type ThemeColors } from '@/core/theme/types';
import { type AppIconName } from '@/shared/ui';

import { type WeatherCondition } from '../domain/Weather';

export interface WeatherIconStyle {
  readonly icon: AppIconName;
  /** A semantic role, so icons follow light and dark themes: sun in amber, rain in blue, clouds muted. */
  readonly color: keyof ThemeColors;
}

const SUN: keyof ThemeColors = 'warning';
const WET: keyof ThemeColors = 'info';
const MUTED: keyof ThemeColors = 'textSecondary';

/** Icon for a condition. Clear and partly cloudy skies have night variants; `isDay: null` uses the day one. */
export function weatherIcon(condition: WeatherCondition, isDay: boolean | null): WeatherIconStyle {
  const night = isDay === false;
  switch (condition) {
    case 'clear':
    case 'mainlyClear':
      return night ? { icon: 'weatherClearNight', color: WET } : { icon: 'weatherClearDay', color: SUN };
    case 'partlyCloudy':
      return night
        ? { icon: 'weatherPartlyCloudyNight', color: MUTED }
        : { icon: 'weatherPartlyCloudyDay', color: SUN };
    case 'overcast':
      return { icon: 'weatherCloudy', color: MUTED };
    case 'fog':
      return { icon: 'weatherFog', color: MUTED };
    case 'drizzle':
      return { icon: 'weatherDrizzle', color: WET };
    case 'rain':
    case 'rainShowers':
      return { icon: 'weatherRain', color: WET };
    case 'heavyRain':
      return { icon: 'weatherHeavyRain', color: WET };
    case 'freezingDrizzle':
    case 'freezingRain':
      return { icon: 'weatherSleet', color: WET };
    case 'snow':
    case 'snowGrains':
    case 'snowShowers':
      return { icon: 'weatherSnow', color: WET };
    case 'thunderstorm':
      return { icon: 'weatherThunderstorm', color: SUN };
    case 'thunderstormHail':
      return { icon: 'weatherHail', color: SUN };
    case 'unknown':
      return { icon: 'weatherUnknown', color: MUTED };
  }
}
