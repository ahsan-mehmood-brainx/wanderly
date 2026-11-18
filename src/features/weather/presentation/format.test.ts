import { createI18n } from '@/core/i18n/createI18n';

import {
  formatAge,
  formatClockTime,
  formatInZone,
  formatMillimetres,
  formatPercent,
  formatSpeed,
  formatTemperature,
  formatWeekday,
  formatWind,
  speakWind,
  zoneLabel,
} from './format';
import { METRIC_UNITS, unitsForLocale, type WeatherUnits } from './units';

const { t } = createI18n('en');
const IMPERIAL: WeatherUnits = { temperature: 'fahrenheit', speed: 'mph' };
const INSTANT = Date.UTC(2026, 10, 12, 20, 5); // 20:05 UTC

describe('temperatures, speeds and amounts', () => {
  it('formats in the user’s units, and missing values as a dash', () => {
    expect(formatTemperature(16.6, METRIC_UNITS, t)).toBe('17°');
    expect(formatTemperature(-0.3, METRIC_UNITS, t)).toBe('0°');
    expect(formatTemperature(20, IMPERIAL, t)).toBe('68°');
    expect(formatTemperature(null, METRIC_UNITS, t)).toBe('—');

    expect(formatSpeed(14.4, METRIC_UNITS, t)).toBe('14 km/h');
    expect(formatSpeed(16.09, IMPERIAL, t)).toBe('10 mph');
    expect(formatSpeed(null, IMPERIAL, t)).toBe('—');

    expect(formatPercent(72, 'en', t)).toBe('72%');
    expect(formatPercent(null, 'en', t)).toBe('—');
    expect(formatMillimetres(2.25, 'en', t)).toBe('2.3 mm');
  });

  it('formats wind with its compass direction, and speaks it in full', () => {
    expect(formatWind(14.4, 315, METRIC_UNITS, t)).toBe('14 km/h NW');
    expect(formatWind(14.4, null, METRIC_UNITS, t)).toBe('14 km/h');
    expect(formatWind(null, 315, METRIC_UNITS, t)).toBe('—');
    expect(speakWind(14.4, 315, METRIC_UNITS, t)).toBe('14 km/h from the northwest');
    expect(speakWind(null, 315, METRIC_UNITS, t)).toBe('not available');
  });

  it('localises numbers and compass points', () => {
    const es = createI18n('es').t;
    expect(formatPercent(72, 'es', es)).toMatch(/^72\s?%$/);
    expect(formatWind(10, 270, METRIC_UNITS, es)).toBe('10 km/h O');
  });
});

describe('times at the forecast location', () => {
  const tokyo = { id: 'Asia/Tokyo', abbreviation: 'JST', utcOffsetSeconds: 9 * 3600 };

  it('shows clock times and weekdays in the location’s time zone, not the device’s', () => {
    expect(formatClockTime(INSTANT, tokyo, 'en')).toBe('5:05 AM');
    expect(formatWeekday(INSTANT, tokyo, 'en')).toBe('Fri');
    expect(formatClockTime(INSTANT, { id: 'Europe/Lisbon', abbreviation: null, utcOffsetSeconds: 0 }, 'en')).toBe(
      '8:05 PM',
    );
  });

  it('falls back to the fixed UTC offset when the zone is unknown to the engine or missing', () => {
    const options = { hour: 'numeric', minute: '2-digit' } as const;
    expect(
      formatInZone(INSTANT, { id: 'Mars/Olympus_Mons', abbreviation: null, utcOffsetSeconds: 9 * 3600 }, 'en', options),
    ).toBe('5:05 AM');
    expect(formatInZone(INSTANT, { id: null, abbreviation: null, utcOffsetSeconds: -10 * 3600 }, 'en', options)).toBe(
      '10:05 AM',
    );
  });

  it('labels the zone by abbreviation, name, or offset', () => {
    expect(zoneLabel(tokyo)).toBe('JST');
    expect(zoneLabel({ id: 'Asia/Kolkata', abbreviation: null, utcOffsetSeconds: 19_800 })).toBe('Asia/Kolkata');
    expect(zoneLabel({ id: null, abbreviation: null, utcOffsetSeconds: 19_800 })).toBe('UTC+05:30');
    expect(zoneLabel({ id: null, abbreviation: null, utcOffsetSeconds: -12_600 })).toBe('UTC-03:30');
  });
});

describe('formatAge', () => {
  it('says how old a saved forecast is', () => {
    expect(formatAge(20_000, t)).toBe('just now');
    expect(formatAge(60_000, t)).toBe('1 minute ago');
    expect(formatAge(45 * 60_000, t)).toBe('45 minutes ago');
    expect(formatAge(3 * 3_600_000 + 1, t)).toBe('3 hours ago');
    expect(formatAge(50 * 3_600_000, t)).toBe('2 days ago');
  });
});

describe('unitsForLocale', () => {
  it('follows the device region', () => {
    expect(unitsForLocale({ temperatureUnit: 'fahrenheit', measurementSystem: 'us' })).toEqual(IMPERIAL);
    expect(unitsForLocale({ temperatureUnit: 'celsius', measurementSystem: 'uk' })).toEqual({
      temperature: 'celsius',
      speed: 'mph',
    });
    expect(unitsForLocale({ temperatureUnit: 'celsius', measurementSystem: 'metric' })).toEqual(METRIC_UNITS);
    expect(unitsForLocale(undefined)).toEqual(METRIC_UNITS);
    expect(unitsForLocale({ temperatureUnit: null, measurementSystem: null })).toEqual(METRIC_UNITS);
  });
});
