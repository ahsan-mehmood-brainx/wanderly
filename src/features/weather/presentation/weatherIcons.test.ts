import { colorSchemes } from '@/core/theme/colors';
import { icons } from '@/shared/ui';

import { WEATHER_CONDITIONS, type WeatherCondition } from '../domain/Weather';

import { weatherIcon } from './weatherIcons';

const DAYLIGHT = [true, false, null] as const;

describe('weatherIcon', () => {
  describe.each(WEATHER_CONDITIONS)('%s', (condition) => {
    it.each(DAYLIGHT)('AC8 maps isDay=%s to a known icon and a theme color in both schemes', (isDay) => {
      const style = weatherIcon(condition, isDay);

      expect(style.icon.length).toBeGreaterThan(0);
      expect(icons).toHaveProperty(style.icon);
      expect(colorSchemes.light).toHaveProperty(style.color);
      expect(colorSchemes.dark).toHaveProperty(style.color);
    });

    it('AC8 treats an unknown time of day (null) as daytime', () => {
      expect(weatherIcon(condition, null)).toEqual(weatherIcon(condition, true));
    });
  });

  it.each(['clear', 'mainlyClear'] as const)('AC8 shows a moon for %s skies at night', (condition) => {
    expect(weatherIcon(condition, false).icon).toBe('weatherClearNight');
    expect(weatherIcon(condition, true).icon).toBe('weatherClearDay');
  });

  it('AC8 has night and day variants for partly cloudy skies', () => {
    expect(weatherIcon('partlyCloudy', false).icon).toBe('weatherPartlyCloudyNight');
    expect(weatherIcon('partlyCloudy', true).icon).toBe('weatherPartlyCloudyDay');
  });

  it.each(['overcast', 'fog', 'rain', 'heavyRain', 'snow', 'thunderstorm', 'thunderstormHail'] as const)(
    'AC8 uses the same %s icon by day and by night',
    (condition) => {
      expect(weatherIcon(condition, false)).toEqual(weatherIcon(condition, true));
    },
  );

  it.each(DAYLIGHT)('AC8 maps an unknown condition to weatherUnknown (isDay=%s)', (isDay) => {
    expect(weatherIcon('unknown', isDay).icon).toBe('weatherUnknown');
  });

  it('AC8 gives distinct icons to conditions a traveller would want told apart', () => {
    const distinct: readonly WeatherCondition[] = [
      'clear',
      'partlyCloudy',
      'overcast',
      'fog',
      'drizzle',
      'rain',
      'heavyRain',
      'snow',
      'thunderstorm',
    ];
    const names = distinct.map((condition) => weatherIcon(condition, true).icon);

    expect(new Set(names).size).toBe(distinct.length);
  });
});
