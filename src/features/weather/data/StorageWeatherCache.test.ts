import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { createTestLogger } from '@/testing/testDependencies';
import { forecastDto, WEATHER_NOW } from '@/testing/weatherFixtures';

import { type Coordinates } from '../domain/Coordinates';
import { forecastDtoSchema } from './dto/openMeteoDtos';
import { toWeatherForecast } from './openMeteoMappers';
import { MAX_SAVED_FORECASTS, StorageWeatherCache, WEATHER_CACHE_KEY } from './StorageWeatherCache';

const forecastFor = (location: Coordinates, fetchedAt = WEATHER_NOW) =>
  toWeatherForecast(forecastDtoSchema.parse(forecastDto({ days: 2 })), location, fetchedAt);

function setup() {
  const store = new InMemoryKeyValueStore();
  const logger = createTestLogger();
  return { store, logger, cache: new StorageWeatherCache(store, logger) };
}

describe('StorageWeatherCache', () => {
  it('saves and loads a forecast by its rounded location', async () => {
    const { cache } = setup();
    const forecast = forecastFor({ latitude: 38.72, longitude: -9.14 });

    await cache.save(forecast);

    expect(await cache.load({ latitude: 38.7213, longitude: -9.1387 })).toEqual(forecast);
    expect(await cache.load({ latitude: 35.68, longitude: 139.69 })).toBeNull();
  });

  it('replaces the entry for the same place and keeps only the most recent places', async () => {
    const { cache, store } = setup();
    for (let index = 0; index < MAX_SAVED_FORECASTS + 2; index++) {
      await cache.save(forecastFor({ latitude: 10 + index, longitude: 20 }));
    }
    await cache.save(forecastFor({ latitude: 17, longitude: 20 }, WEATHER_NOW + 1));

    const saved = JSON.parse((await store.getItem(WEATHER_CACHE_KEY)) ?? '[]') as { location: Coordinates }[];
    expect(saved.map((entry) => entry.location.latitude)).toEqual([17, 16, 15, 14, 13, 12]);
    expect(await cache.load({ latitude: 10, longitude: 20 })).toBeNull();
    expect((await cache.load({ latitude: 17, longitude: 20 }))?.fetchedAt).toBe(WEATHER_NOW + 1);
  });

  it('keeps both forecasts when two places are saved at the same time', async () => {
    const { cache } = setup();
    const lisbon = forecastFor({ latitude: 38.72, longitude: -9.14 });
    const tokyo = forecastFor({ latitude: 35.68, longitude: 139.69 });

    await Promise.all([cache.save(lisbon), cache.save(tokyo)]);

    expect(await cache.load(lisbon.location)).toEqual(lisbon);
    expect(await cache.load(tokyo.location)).toEqual(tokyo);
  });

  it('keeps saving after a save fails', async () => {
    const { cache, store } = setup();
    const lisbon = forecastFor({ latitude: 38.72, longitude: -9.14 });
    jest.spyOn(store, 'setItem').mockRejectedValueOnce(new Error('full'));

    await cache.save(forecastFor({ latitude: 1, longitude: 2 }));
    await cache.save(lisbon);

    expect(await cache.load(lisbon.location)).toEqual(lisbon);
  });

  it('treats unreadable or corrupt data as a miss and skips only the bad entry', async () => {
    const { cache, store } = setup();
    const good = forecastFor({ latitude: 38.72, longitude: -9.14 });

    await store.setItem(WEATHER_CACHE_KEY, 'not json');
    expect(await cache.load(good.location)).toBeNull();

    await store.setItem(WEATHER_CACHE_KEY, JSON.stringify([{ location: 'nowhere' }, good]));
    expect(await cache.load(good.location)).toEqual(good);

    await store.setItem(WEATHER_CACHE_KEY, JSON.stringify({ not: 'a list' }));
    expect(await cache.load(good.location)).toBeNull();
  });

  it('never fails when storage does', async () => {
    const { cache, store, logger } = setup();
    jest.spyOn(store, 'getItem').mockRejectedValue(new Error('disk'));
    jest.spyOn(store, 'setItem').mockRejectedValue(new Error('full'));

    await expect(cache.save(forecastFor({ latitude: 1, longitude: 2 }))).resolves.toBeUndefined();
    await expect(cache.load({ latitude: 1, longitude: 2 })).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });
});
