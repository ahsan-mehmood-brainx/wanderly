import { type TFunction } from 'i18next';

import { distanceUnitsForLocale, formatDistance } from './format';

const t = ((key: string, options: { value: string }) =>
  `${key.replace('map.distance.', '')}:${options.value}`) as unknown as TFunction;

describe('formatDistance edge cases', () => {
  it.each([
    [0, 'm:0'],
    [994, 'm:990'],
    [995, 'km:1'],
    [999.9, 'km:1'],
    [1_000, 'km:1'],
    [1_549, 'km:1.5'],
  ])('shows %p metres as %p in metric', (meters, expected) => {
    expect(formatDistance(meters, 'metric', 'en', t)).toBe(expected);
  });

  it.each([
    [150, 'ft:490'],
    [161, 'mi:0.1'],
    [1_609.344, 'mi:1'],
  ])('shows %p metres as %p in imperial', (meters, expected) => {
    expect(formatDistance(meters, 'imperial', 'en', t)).toBe(expected);
  });

  it('uses the app language for decimal separators', () => {
    expect(formatDistance(1_500, 'metric', 'es', t)).toBe('km:1,5');
  });

  it('falls back to plain digits when the language tag is invalid', () => {
    expect(formatDistance(1_500, 'metric', 'not a locale!', t)).toBe('km:1.5');
  });
});

describe('distanceUnitsForLocale edge cases', () => {
  it('uses metric when the locale or its measurement system is unknown', () => {
    expect(distanceUnitsForLocale(undefined)).toBe('metric');
    expect(distanceUnitsForLocale({ measurementSystem: null })).toBe('metric');
  });

  it('uses miles for the UK and US measurement systems', () => {
    expect(distanceUnitsForLocale({ measurementSystem: 'uk' })).toBe('imperial');
    expect(distanceUnitsForLocale({ measurementSystem: 'us' })).toBe('imperial');
  });
});
