import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { createTestLogger } from '@/testing/testDependencies';

import { type CustomMarker, MAX_CUSTOM_MARKERS } from '../domain/Place';
import { CUSTOM_MARKERS_KEY, StorageCustomMarkerRepository } from './StorageCustomMarkerRepository';

const pin = (id: string, latitude = 48.85837, longitude = 2.29448, createdAt = 1_700_000_000_000): CustomMarker => ({
  id,
  coordinates: { latitude, longitude },
  createdAt,
});

function setup(initial: Record<string, string> = {}) {
  const store = new InMemoryKeyValueStore(initial);
  const logger = createTestLogger();
  return { store, logger, repository: new StorageCustomMarkerRepository(store, logger) };
}

describe('StorageCustomMarkerRepository', () => {
  it('saves pins under map.customMarkers.v1 and restores them', async () => {
    const { repository, store } = setup();
    const pins = [pin('a'), pin('b', -33.85678, 151.2153)];

    expect(await repository.save(pins)).toEqual({ ok: true, value: undefined });

    expect(CUSTOM_MARKERS_KEY).toBe('map.customMarkers.v1');
    expect(JSON.parse(store.data.get('map.customMarkers.v1') ?? 'null')).toEqual(pins);
    await expect(repository.load()).resolves.toEqual(pins);
  });

  it('restores pins saved by an earlier run', async () => {
    const { repository } = setup({ 'map.customMarkers.v1': JSON.stringify([pin('a')]) });

    await expect(repository.load()).resolves.toEqual([pin('a')]);
  });

  it('starts empty when nothing is stored or the data is unreadable', async () => {
    await expect(setup().repository.load()).resolves.toEqual([]);
    await expect(setup({ 'map.customMarkers.v1': '{not json' }).repository.load()).resolves.toEqual([]);
    await expect(setup({ 'map.customMarkers.v1': '{"a":1}' }).repository.load()).resolves.toEqual([]);
  });

  it('drops corrupt pins one by one, keeping the rest', async () => {
    const { repository } = setup({
      'map.customMarkers.v1': JSON.stringify([
        pin('a'),
        { id: 'no-coordinates', createdAt: 1 },
        { ...pin('nan'), coordinates: { latitude: 'north', longitude: 2 } },
        { ...pin('range'), coordinates: { latitude: 120, longitude: 2 } },
        { ...pin('null-island'), coordinates: { latitude: 0, longitude: 0 } },
        { coordinates: { latitude: 48.8, longitude: 2.3 }, createdAt: 1 },
        'junk',
        null,
        pin('b'),
      ]),
    });

    await expect(repository.load()).resolves.toEqual([pin('a'), pin('b')]);
  });

  it(`restores at most ${MAX_CUSTOM_MARKERS} pins`, async () => {
    const many = Array.from({ length: MAX_CUSTOM_MARKERS + 5 }, (_, index) => pin(`p${index}`));
    const { repository } = setup({ 'map.customMarkers.v1': JSON.stringify(many) });

    await expect(repository.load()).resolves.toHaveLength(MAX_CUSTOM_MARKERS);
  });

  it('treats a storage read failure as no pins and logs it', async () => {
    const { repository, store, logger } = setup();
    jest.spyOn(store, 'getItem').mockRejectedValue(new Error('locked'));

    await expect(repository.load()).resolves.toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('reports a storage write failure', async () => {
    const { repository, store } = setup();
    jest.spyOn(store, 'setItem').mockRejectedValue(new Error('disk full'));

    const result = await repository.save([pin('a')]);

    expect(!result.ok && result.error.kind).toBe('storage');
  });
});
