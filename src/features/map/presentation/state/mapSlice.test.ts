import { createTestStore } from '@/testing/createTestStore';
import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { createTestDependencies } from '@/testing/testDependencies';

import { CUSTOM_MARKERS_KEY } from '../../data/StorageCustomMarkerRepository';
import { addCustomMarker, loadCustomMarkers, removeCustomMarker } from './mapSlice';

const pin = (id: string, latitude: number) => ({ id, coordinates: { latitude, longitude: 2.3 }, createdAt: 1 });

/** Storage whose writes take a few ticks, so overlapping pin changes really overlap. */
class SlowStore extends InMemoryKeyValueStore {
  override async setItem(key: string, value: string): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
    return super.setItem(key, value);
  }
}

async function setup(initial: readonly ReturnType<typeof pin>[] = []) {
  const keyValueStore = new SlowStore({ [CUSTOM_MARKERS_KEY]: JSON.stringify(initial) });
  const store = createTestStore(createTestDependencies({ keyValueStore }));
  await store.dispatch(loadCustomMarkers());
  const savedIds = () =>
    (JSON.parse(keyValueStore.data.get(CUSTOM_MARKERS_KEY) ?? '[]') as { id: string }[]).map((marker) => marker.id);
  return { store, savedIds, ids: () => store.getState().map.customMarkers.map((marker) => marker.id) };
}

describe('mapSlice pin changes', () => {
  it('keeps both pins when two long presses are saved at the same time', async () => {
    const { store, ids, savedIds } = await setup();

    await Promise.all([
      store.dispatch(addCustomMarker({ latitude: 48.86, longitude: 2.29 })),
      store.dispatch(addCustomMarker({ latitude: 48.87, longitude: 2.3 })),
    ]);

    expect(ids()).toHaveLength(2);
    expect(savedIds()).toEqual(ids());
  });

  it('keeps a new pin when an older one is removed while it is still saving', async () => {
    const { store, ids, savedIds } = await setup([pin('p1', 48.86)]);

    await Promise.all([
      store.dispatch(addCustomMarker({ latitude: 48.87, longitude: 2.3 })),
      store.dispatch(removeCustomMarker('p1')),
    ]);

    expect(ids()).toHaveLength(1);
    expect(ids()).not.toContain('p1');
    expect(savedIds()).toEqual(ids());
  });
});
