import { forecastDto, WEATHER_NOW } from '@/testing/weatherFixtures';

import { forecastDtoSchema } from './dto/openMeteoDtos';
import { toWeatherForecast } from './openMeteoMappers';

const REQUESTED = { latitude: 38.72, longitude: -9.14 };
const FETCHED_AT = WEATHER_NOW;

/** Validates like the HTTP client does, then maps. */
function map(payload: unknown) {
  const parsed = forecastDtoSchema.safeParse(payload);
  if (!parsed.success) throw parsed.error;
  return toWeatherForecast(parsed.data, REQUESTED, FETCHED_AT);
}

describe('Open-Meteo response mapping', () => {
  it('maps current conditions, hourly and daily forecasts to metric domain values', () => {
    const forecast = map(forecastDto());

    expect(forecast.location).toEqual(REQUESTED);
    expect(forecast.fetchedAt).toBe(FETCHED_AT);
    expect(forecast.timeZone).toEqual({ id: 'Europe/Lisbon', abbreviation: 'GMT', utcOffsetSeconds: 0 });
    expect(forecast.current).toEqual({
      time: Date.UTC(2026, 10, 12, 10, 30),
      condition: 'partlyCloudy',
      isDay: true,
      temperatureC: 15,
      feelsLikeC: 14,
      humidityPercent: 72,
      windSpeedKmh: 14.4,
      windDirectionDeg: 315,
      precipitationProbability: 20,
    });
    expect(forecast.hourly).toHaveLength(7 * 24);
    expect(forecast.hourly[1]).toMatchObject({
      time: Date.UTC(2026, 10, 12, 1),
      condition: 'mainlyClear',
      isDay: false,
      temperatureC: 10.5,
    });
    expect(forecast.daily).toHaveLength(7);
    expect(forecast.daily[0]).toEqual({
      date: '2026-11-12',
      time: Date.UTC(2026, 10, 12),
      condition: 'clear',
      maxTemperatureC: 22,
      minTemperatureC: 10,
      precipitationProbability: 0,
      precipitationMm: 0,
      uvIndexMax: 3.7,
      windSpeedMaxKmh: 25,
      sunrise: Date.UTC(2026, 10, 12, 7, 30),
      sunset: Date.UTC(2026, 10, 12, 17, 15),
      daylight: 'normal',
    });
  });

  it('dates each day by its local midnight, not UTC (timezone=auto, unixtime)', () => {
    // Tokyo: local midnight of 13 Nov is 15:00 UTC on 12 Nov.
    const forecast = map(
      forecastDto({
        now: Date.UTC(2026, 10, 12, 20, 0),
        timezone: 'Asia/Tokyo',
        abbreviation: 'JST',
        utcOffsetSeconds: 9 * 3600,
      }),
    );
    expect(forecast.daily[0]).toMatchObject({ date: '2026-11-13', time: Date.UTC(2026, 10, 12, 15) });
    expect(forecast.timeZone).toEqual({ id: 'Asia/Tokyo', abbreviation: 'JST', utcOffsetSeconds: 32400 });
  });

  it('keeps missing values as null instead of zero, hour by hour', () => {
    const dto = forecastDto({ days: 1 });
    const forecast = map({
      ...dto,
      current: { time: dto.current?.time, temperature_2m: null, weather_code: null },
      hourly: {
        ...dto.hourly,
        temperature_2m: [null, 12, ...(dto.hourly?.temperature_2m ?? []).slice(2)],
        // A series shorter than `time` leaves the rest unknown.
        relative_humidity_2m: [55],
        // A whole series missing.
        wind_speed_10m: undefined,
      },
    });

    expect(forecast.current).toMatchObject({
      temperatureC: null,
      condition: 'unknown',
      humidityPercent: null,
      isDay: null,
    });
    expect(forecast.hourly[0]).toMatchObject({ temperatureC: null, humidityPercent: 55, windSpeedKmh: null });
    expect(forecast.hourly[1]).toMatchObject({ temperatureC: 12, humidityPercent: null });
  });

  it('blanks malformed values individually instead of rejecting the forecast', () => {
    const dto = forecastDto({ days: 1 });
    const forecast = map({
      ...dto,
      timezone: 42,
      current: { ...dto.current, temperature_2m: 'warm', relative_humidity_2m: 'NaN' },
      hourly: { ...dto.hourly, temperature_2m: ['hot', ...(dto.hourly?.temperature_2m ?? []).slice(1)] },
      daily: { ...dto.daily, sunrise: 'soon' },
    });

    expect(forecast.timeZone.id).toBeNull();
    expect(forecast.current).toMatchObject({ temperatureC: null, humidityPercent: null, feelsLikeC: 14 });
    expect(forecast.hourly[0]?.temperatureC).toBeNull();
    expect(forecast.hourly[1]?.temperatureC).toBe(10.5);
    expect(forecast.daily[0]).toMatchObject({ sunrise: null, sunset: null, maxTemperatureC: 22 });
  });

  it('drops a block whose time axis is unusable, keeping the others', () => {
    const forecast = map({ ...forecastDto(), hourly: { time: 'yesterday' }, current: null });
    expect(forecast.hourly).toEqual([]);
    expect(forecast.current).toBeNull();
    expect(forecast.daily).toHaveLength(7);
  });

  it('clamps percentages and rejects impossible readings', () => {
    const dto = forecastDto({ days: 1 });
    const forecast = map({
      ...dto,
      current: {
        ...dto.current,
        relative_humidity_2m: 104,
        precipitation_probability: -5,
        wind_speed_10m: -3,
        wind_direction_10m: 370,
        is_day: 7,
      },
      daily: { ...dto.daily, uv_index_max: [-1], precipitation_sum: [-0.2] },
    });

    expect(forecast.current).toMatchObject({
      humidityPercent: 100,
      precipitationProbability: 0,
      windSpeedKmh: null,
      windDirectionDeg: 10,
      isDay: null,
    });
    expect(forecast.daily[0]).toMatchObject({ uvIndexMax: null, precipitationMm: null });
  });

  it('keeps a day’s low at or below its high', () => {
    const dto = forecastDto({ days: 1 });
    const forecast = map({ ...dto, daily: { ...dto.daily, temperature_2m_max: [8], temperature_2m_min: [11] } });
    expect(forecast.daily[0]).toMatchObject({ minTemperatureC: 8, maxTemperatureC: 11 });
  });

  it('sorts entries and drops duplicate times', () => {
    const forecast = map({
      ...forecastDto({ days: 1 }),
      hourly: { time: [7200, 0, 3600, 3600], temperature_2m: [3, 1, 2, 99] },
    });
    expect(forecast.hourly.map((hour) => [hour.time, hour.temperatureC])).toEqual([
      [0, 1],
      [3_600_000, 2],
      [7_200_000, 3],
    ]);
  });

  it('recognises polar night in a real Svalbard response (sunrise = sunset = midnight)', () => {
    // Captured from api.open-meteo.com for 78.2, 15.6 in November.
    const forecast = map({
      latitude: 78.13708,
      longitude: 15.6069355,
      utc_offset_seconds: 3600,
      timezone: 'Arctic/Longyearbyen',
      timezone_abbreviation: 'GMT+1',
      daily: {
        time: [1794351600, 1794438000],
        sunrise: [1794351600, 1794438000],
        sunset: [1794351600, 1794438000],
        daylight_duration: [0, 0],
      },
    });

    expect(forecast.daily[0]).toMatchObject({
      // 1794351600 is local midnight (UTC+1) starting 11 Nov.
      date: '2026-11-11',
      daylight: 'polarNight',
      sunrise: null,
      sunset: null,
    });
    expect(forecast.current).toBeNull();
  });

  it('recognises midnight sun', () => {
    const forecast = map({
      latitude: 78.2,
      longitude: 15.6,
      utc_offset_seconds: 7200,
      daily: { time: [1781733600], sunrise: [1781733600], sunset: [1781733600], daylight_duration: [86400] },
    });
    expect(forecast.daily[0]).toMatchObject({ daylight: 'polarDay', sunrise: null });
  });

  it("rejects the API's error body, which lacks the forecast envelope", () => {
    const parsed = forecastDtoSchema.safeParse({
      error: true,
      reason: 'Latitude must be in range of -90 to 90°. Given: 95.0.',
    });
    expect(parsed.success).toBe(false);
  });
});
