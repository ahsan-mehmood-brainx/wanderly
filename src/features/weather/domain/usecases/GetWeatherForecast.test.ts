import { AppError, type AppErrorKind } from '@/core/errors/AppError';
import { err, ok } from '@/core/result';
import { ManualClock } from '@/testing/ManualClock';
import { createTestLogger } from '@/testing/testDependencies';

import { type Coordinates, coordinatesKey } from '../Coordinates';
import { type WeatherCache, type WeatherRepository } from '../repositories';
import { type WeatherForecast } from '../Weather';
import { HOUR_MS } from '../weatherCalculations';
import { DEFAULT_WEATHER_CACHE_POLICY, GetWeatherForecast } from './GetWeatherForecast';

const NOW = Date.UTC(2026, 10, 12, 10, 0);
const LISBON: Coordinates = { latitude: 38.72, longitude: -9.14 };

const forecastAt = (location: Coordinates, fetchedAt: number): WeatherForecast => ({
  location,
  timeZone: { id: 'Europe/Lisbon', abbreviation: 'GMT', utcOffsetSeconds: 0 },
  current: null,
  hourly: [],
  daily: [],
  fetchedAt,
});

class MemoryWeatherCache implements WeatherCache {
  readonly entries = new Map<string, WeatherForecast>();
  readonly save = jest.fn(async (forecast: WeatherForecast) => {
    this.entries.set(coordinatesKey(forecast.location), forecast);
  });

  async load(location: Coordinates) {
    return this.entries.get(coordinatesKey(location)) ?? null;
  }
}

function setup() {
  const clock = new ManualClock(NOW);
  const cache = new MemoryWeatherCache();
  const repository: jest.Mocked<WeatherRepository> = {
    getForecast: jest.fn(async (location: Coordinates) => ok(forecastAt(location, clock.now()))),
  };
  const useCase = new GetWeatherForecast(repository, cache, clock, createTestLogger());
  return { clock, cache, repository, useCase };
}

const failWith = (kind: AppErrorKind) => async () => err(new AppError(kind, kind));

describe('GetWeatherForecast', () => {
  it('downloads a forecast for rounded coordinates and saves it', async () => {
    const { useCase, repository, cache } = setup();
    const signal = new AbortController().signal;

    const result = await useCase.execute({ location: { latitude: 38.72231, longitude: -9.13936 }, signal });

    expect(result).toEqual({
      ok: true,
      value: { forecast: forecastAt(LISBON, NOW), source: 'network', fallbackReason: null },
    });
    expect(repository.getForecast).toHaveBeenCalledWith(LISBON, signal);
    expect(cache.save).toHaveBeenCalledWith(forecastAt(LISBON, NOW));
  });

  it('fails without a request for missing or invalid coordinates', async () => {
    const { useCase, repository } = setup();

    const missing = await useCase.execute({ location: null });
    const invalid = await useCase.execute({ location: { latitude: 123, longitude: 4 } });

    expect(!missing.ok && missing.error.kind).toBe('locationUnavailable');
    expect(!invalid.ok && invalid.error.kind).toBe('invalidLocation');
    expect(repository.getForecast).not.toHaveBeenCalled();
  });

  it('serves a fresh saved forecast without a request', async () => {
    const { useCase, repository, cache } = setup();
    await cache.save(forecastAt(LISBON, NOW - 5 * 60_000));

    const result = await useCase.execute({ location: LISBON });

    expect(result.ok && result.value).toMatchObject({ source: 'cache', fallbackReason: null });
    expect(repository.getForecast).not.toHaveBeenCalled();
  });

  it('downloads again when forced (pull to refresh) or once the saved copy is no longer fresh', async () => {
    const { useCase, repository, cache } = setup();
    await cache.save(forecastAt(LISBON, NOW - 5 * 60_000));

    const forced = await useCase.execute({ location: LISBON, forceRefresh: true });
    expect(forced.ok && forced.value.source).toBe('network');

    await cache.save(forecastAt(LISBON, NOW - DEFAULT_WEATHER_CACHE_POLICY.freshForMs));
    const expired = await useCase.execute({ location: LISBON });
    expect(expired.ok && expired.value.source).toBe('network');
    expect(repository.getForecast).toHaveBeenCalledTimes(2);
  });

  it.each(['offline', 'network', 'timeout', 'server', 'rateLimited', 'parse'] as const)(
    'falls back to the saved forecast on %s, saying why',
    async (kind) => {
      const { useCase, repository, cache } = setup();
      const saved = forecastAt(LISBON, NOW - 6 * HOUR_MS);
      await cache.save(saved);
      cache.save.mockClear();
      repository.getForecast.mockImplementation(failWith(kind));

      const result = await useCase.execute({ location: LISBON });

      expect(result).toEqual({ ok: true, value: { forecast: saved, source: 'cache', fallbackReason: kind } });
      expect(cache.save).not.toHaveBeenCalled();
    },
  );

  it('reports the failure when there is no saved forecast', async () => {
    const { useCase, repository } = setup();
    repository.getForecast.mockImplementation(failWith('timeout'));

    const result = await useCase.execute({ location: LISBON });

    expect(!result.ok && result.error.kind).toBe('timeout');
  });

  it('does not show a saved forecast that is too old to be useful', async () => {
    const { useCase, repository, cache } = setup();
    await cache.save(forecastAt(LISBON, NOW - DEFAULT_WEATHER_CACHE_POLICY.usableForMs));
    repository.getForecast.mockImplementation(failWith('offline'));

    const result = await useCase.execute({ location: LISBON });

    expect(!result.ok && result.error.kind).toBe('offline');
  });

  it.each(['badRequest', 'cancelled'] as const)('does not hide a %s failure behind saved data', async (kind) => {
    const { useCase, repository, cache } = setup();
    await cache.save(forecastAt(LISBON, NOW - HOUR_MS));
    repository.getForecast.mockImplementation(failWith(kind));

    const result = await useCase.execute({ location: LISBON });

    expect(!result.ok && result.error.kind).toBe(kind);
  });

  it('keeps saved forecasts per location', async () => {
    const { useCase, repository, cache } = setup();
    await cache.save(forecastAt({ latitude: 35.68, longitude: 139.69 }, NOW - HOUR_MS));
    repository.getForecast.mockImplementation(failWith('offline'));

    const result = await useCase.execute({ location: LISBON });

    expect(!result.ok && result.error.kind).toBe('offline');
  });
});
