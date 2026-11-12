import { type DailyForecast, type HourlyForecast, type WeatherConditions, type WeatherForecast } from './Weather';
import {
  celsiusToFahrenheit,
  compassPoint,
  conditionsAt,
  DAY_MS,
  daylightOf,
  deviceUtcOffsetSeconds,
  HOUR_MS,
  hourAt,
  kmhToMph,
  localDateKey,
  normalizeDegrees,
  rangeBarPosition,
  roundForDisplay,
  summarizeForecast,
  temperatureSpan,
  timeZoneDiffers,
  upcomingDays,
  upcomingHours,
} from './weatherCalculations';

const T0 = Date.UTC(2026, 10, 12, 0, 0); // 2026-11-12 00:00 UTC

function conditions(time: number, overrides: Partial<WeatherConditions> = {}): WeatherConditions {
  return {
    time,
    condition: 'clear',
    isDay: true,
    temperatureC: 20,
    feelsLikeC: 19,
    humidityPercent: 50,
    windSpeedKmh: 10,
    windDirectionDeg: 90,
    precipitationProbability: 0,
    ...overrides,
  };
}

const hoursFrom = (start: number, count: number): HourlyForecast[] =>
  Array.from({ length: count }, (_, index) => conditions(start + index * HOUR_MS, { temperatureC: index }));

function day(date: string, time: number, overrides: Partial<DailyForecast> = {}): DailyForecast {
  return {
    date,
    time,
    condition: 'clear',
    maxTemperatureC: 20,
    minTemperatureC: 10,
    precipitationProbability: 0,
    precipitationMm: 0,
    uvIndexMax: 3,
    windSpeedMaxKmh: 20,
    sunrise: null,
    sunset: null,
    daylight: null,
    ...overrides,
  };
}

describe('units', () => {
  it('converts temperatures and speeds', () => {
    expect(celsiusToFahrenheit(0)).toBe(32);
    expect(celsiusToFahrenheit(100)).toBe(212);
    expect(celsiusToFahrenheit(-40)).toBe(-40);
    expect(kmhToMph(1.609344)).toBeCloseTo(1);
    expect(kmhToMph(100)).toBeCloseTo(62.137, 2);
  });

  it('rounds for display without showing -0', () => {
    expect(roundForDisplay(-0.4)).toBe(0);
    expect(Object.is(roundForDisplay(-0.4), -0)).toBe(false);
    expect(roundForDisplay(16.5)).toBe(17);
    expect(roundForDisplay(-3.6)).toBe(-4);
  });
});

describe('compassPoint', () => {
  it.each([
    [0, 'N'],
    [22, 'N'],
    [23, 'NE'],
    [45, 'NE'],
    [90, 'E'],
    [180, 'S'],
    [225, 'SW'],
    [291, 'W'],
    [315, 'NW'],
    [337.4, 'NW'],
    [337.5, 'N'],
    [360, 'N'],
    [-45, 'NW'],
    [720 + 90, 'E'],
  ] as const)('%d° is %s', (degrees, point) => {
    expect(compassPoint(degrees)).toBe(point);
  });

  it('has no direction for a missing or non-finite angle', () => {
    expect(compassPoint(null)).toBeNull();
    expect(compassPoint(Number.NaN)).toBeNull();
    expect(compassPoint(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('normalises angles into [0, 360)', () => {
    expect(normalizeDegrees(-90)).toBe(270);
    expect(normalizeDegrees(360)).toBe(0);
    expect(normalizeDegrees(495)).toBe(135);
  });
});

describe('time zones', () => {
  // 20:00 UTC on 12 Nov: already 13 Nov in Tokyo (UTC+9), still 12 Nov in Honolulu (UTC−10).
  const evening = Date.UTC(2026, 10, 12, 20, 0);

  it("computes today's date at the forecast location, not on the device", () => {
    expect(localDateKey(evening, 0)).toBe('2026-11-12');
    expect(localDateKey(evening, 9 * 3600)).toBe('2026-11-13');
    expect(localDateKey(Date.UTC(2026, 10, 12, 5, 0), -10 * 3600)).toBe('2026-11-11');
    // Half-hour zones (India, UTC+5:30) cross midnight at :30.
    expect(localDateKey(Date.UTC(2026, 10, 12, 18, 29), 5.5 * 3600)).toBe('2026-11-12');
    expect(localDateKey(Date.UTC(2026, 10, 12, 18, 30), 5.5 * 3600)).toBe('2026-11-13');
  });

  it('notices when the forecast clock differs from the device clock', () => {
    expect(timeZoneDiffers(32400, 0)).toBe(true);
    expect(timeZoneDiffers(3600, 3600)).toBe(false);
  });

  it('reads the device offset with east positive, like Open-Meteo', () => {
    const spy = jest.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-540); // JS: minutes *behind* UTC
    expect(deviceUtcOffsetSeconds(evening)).toBe(32400);
    spy.mockReturnValue(0);
    expect(Object.is(deviceUtcOffsetSeconds(evening), -0)).toBe(false);
    spy.mockRestore();
  });
});

describe('upcomingHours / hourAt', () => {
  const hours = hoursFrom(T0, 48);

  it('starts with the hour in progress and returns the next 24', () => {
    const now = T0 + 10 * HOUR_MS + 30 * 60_000; // 10:30
    const upcoming = upcomingHours(hours, now);
    expect(upcoming).toHaveLength(24);
    expect(upcoming[0]?.time).toBe(T0 + 10 * HOUR_MS);
    expect(hourAt(hours, now)?.temperatureC).toBe(10);
  });

  it('skips past hours of an old saved forecast and returns what is left', () => {
    const now = T0 + 40 * HOUR_MS;
    expect(upcomingHours(hours, now).map((hour) => hour.temperatureC)).toEqual([40, 41, 42, 43, 44, 45, 46, 47]);
    expect(upcomingHours(hours, T0 + 100 * HOUR_MS)).toEqual([]);
    expect(hourAt(hours, T0 + 100 * HOUR_MS)).toBeNull();
  });
});

describe('upcomingDays', () => {
  const tokyoOffset = 9 * 3600;
  // Tokyo midnights for 12–15 Nov, as instants.
  const days = ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'].map((date, index) =>
    day(date, T0 - tokyoOffset * 1000 + index * DAY_MS),
  );

  it('starts at today in the location’s time zone', () => {
    const evening = Date.UTC(2026, 10, 12, 20, 0); // 05:00 on the 13th in Tokyo
    expect(upcomingDays(days, evening, tokyoOffset).map((entry) => entry.date)).toEqual([
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ]);
    expect(upcomingDays(days, evening, 0).map((entry) => entry.date)[0]).toBe('2026-11-12');
  });

  it('caps the number of days', () => {
    expect(upcomingDays(days, T0, tokyoOffset, 2)).toHaveLength(2);
  });
});

describe('conditionsAt', () => {
  const hours = hoursFrom(T0, 24);
  const now = T0 + 10 * HOUR_MS + 20 * 60_000;

  it('uses recent current conditions', () => {
    const current = conditions(T0 + 10 * HOUR_MS + 15 * 60_000, { temperatureC: 16.9 });
    expect(conditionsAt({ current, hourly: hours }, now)?.temperatureC).toBe(16.9);
  });

  it('fills values missing from current conditions with the forecast for this hour', () => {
    const current = conditions(now, {
      temperatureC: 16.9,
      humidityPercent: null,
      windDirectionDeg: null,
      condition: 'unknown',
    });
    const hourly = hours.map((hour) => ({ ...hour, humidityPercent: 81, condition: 'fog' as const }));
    expect(conditionsAt({ current, hourly }, now)).toMatchObject({
      temperatureC: 16.9,
      humidityPercent: 81,
      windDirectionDeg: 90,
      condition: 'fog',
      time: now,
    });
  });

  it('falls back to the forecast for this hour when current conditions are stale (saved forecast)', () => {
    const stale = conditions(T0, { temperatureC: 99 });
    expect(conditionsAt({ current: stale, hourly: hours }, now)?.temperatureC).toBe(10);
  });

  it('is null when nothing covers now', () => {
    expect(conditionsAt({ current: null, hourly: [] }, now)).toBeNull();
    expect(conditionsAt({ current: null, hourly: hours }, T0 + 30 * HOUR_MS)).toBeNull();
  });
});

describe('daylightOf', () => {
  const sunrise = T0 + 7 * HOUR_MS;
  const sunset = T0 + 17 * HOUR_MS;

  it('is a normal day when the sun rises before it sets', () => {
    expect(daylightOf(sunrise, sunset, 10 * 3600)).toBe('normal');
    expect(daylightOf(sunrise, sunset, null)).toBe('normal');
  });

  it('tells polar night from midnight sun by the length of daylight (both report sunrise = sunset)', () => {
    expect(daylightOf(T0, T0, 0)).toBe('polarNight');
    expect(daylightOf(T0, T0, 86_400)).toBe('polarDay');
    expect(daylightOf(T0, T0, 86_370)).toBe('polarDay');
  });

  it('is unknown without usable data', () => {
    expect(daylightOf(null, null, null)).toBeNull();
    expect(daylightOf(T0, T0, null)).toBeNull();
    expect(daylightOf(sunset, sunrise, null)).toBeNull();
  });
});

describe('temperature ranges', () => {
  const week = [
    day('2026-11-12', T0, { minTemperatureC: 10, maxTemperatureC: 20 }),
    day('2026-11-13', T0 + DAY_MS, { minTemperatureC: 5, maxTemperatureC: null }),
    day('2026-11-14', T0 + 2 * DAY_MS, { minTemperatureC: null, maxTemperatureC: 25 }),
  ];

  it('spans the coldest low to the warmest high, ignoring missing values', () => {
    expect(temperatureSpan(week)).toEqual({ min: 5, max: 25 });
    expect(temperatureSpan([day('2026-11-12', T0, { minTemperatureC: null, maxTemperatureC: null })])).toBeNull();
    expect(temperatureSpan([])).toBeNull();
  });

  it("positions a day's bar within the week's span", () => {
    const span = { min: 5, max: 25 };
    expect(rangeBarPosition(span, 10, 20)).toEqual({ start: 0.25, end: 0.75 });
    expect(rangeBarPosition(span, 5, 25)).toEqual({ start: 0, end: 1 });
  });

  it('draws a point when only one value is known, and nothing when neither is', () => {
    expect(rangeBarPosition({ min: 0, max: 10 }, null, 5)).toEqual({ start: 0.5, end: 0.5 });
    expect(rangeBarPosition({ min: 0, max: 10 }, 5, null)).toEqual({ start: 0.5, end: 0.5 });
    expect(rangeBarPosition({ min: 0, max: 10 }, null, null)).toBeNull();
  });

  it('fills the track for a flat week and clamps values outside the span', () => {
    expect(rangeBarPosition({ min: 12, max: 12 }, 12, 12)).toEqual({ start: 0, end: 1 });
    expect(rangeBarPosition({ min: 0, max: 10 }, -5, 15)).toEqual({ start: 0, end: 1 });
    // Swapped extremes still draw low → high.
    expect(rangeBarPosition({ min: 0, max: 10 }, 8, 2)).toEqual({ start: 0.2, end: 0.8 });
  });
});

describe('summarizeForecast', () => {
  const tokyo = 9 * 3600;
  const tokyoMidnight = T0 - tokyo * 1000; // 12 Nov 00:00 JST
  const forecast: WeatherForecast = {
    location: { latitude: 35.68, longitude: 139.69 },
    timeZone: { id: 'Asia/Tokyo', abbreviation: 'JST', utcOffsetSeconds: tokyo },
    current: null,
    hourly: hoursFrom(tokyoMidnight, 72),
    daily: [0, 1, 2].map((index) =>
      day(localDateKey(tokyoMidnight + index * DAY_MS, tokyo), tokyoMidnight + index * DAY_MS, {
        minTemperatureC: index,
        maxTemperatureC: 10 + index,
      }),
    ),
    fetchedAt: T0,
  };

  it("derives now, today (in Tokyo), the next hours, the coming days and the week's span", () => {
    const now = Date.UTC(2026, 10, 12, 20, 0); // 05:00 on 13 Nov in Tokyo
    const summary = summarizeForecast(forecast, now);

    expect(summary.today?.date).toBe('2026-11-13');
    expect(summary.days.map((entry) => entry.date)).toEqual(['2026-11-13', '2026-11-14']);
    expect(summary.now?.temperatureC).toBe(29); // hour 29 after Tokyo midnight on the 12th
    expect(summary.hours).toHaveLength(24);
    expect(summary.span).toEqual({ min: 1, max: 12 });
    expect(summary.ageMs).toBe(now - T0);
  });

  it('has no "today" when the saved forecast no longer covers it', () => {
    const summary = summarizeForecast(forecast, T0 + 10 * DAY_MS);
    expect(summary.today).toBeNull();
    expect(summary.days).toEqual([]);
    expect(summary.now).toBeNull();
  });
});
