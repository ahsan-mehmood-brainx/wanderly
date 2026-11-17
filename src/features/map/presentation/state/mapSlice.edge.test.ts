import { createTestStore } from '@/testing/createTestStore';
import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { createTestDependencies } from '@/testing/testDependencies';

import { CUSTOM_MARKERS_KEY } from '../../data/StorageCustomMarkerRepository';
import { addCustomMarker, loadCustomMarkers, removeCustomMarker } from './mapSlice';

const pin = (id: string, latitude: number) => ({ id, coordinates: { latitude, longitude: 2.3 }, createdAt: 1 });

class SwitchableStore extends InMemoryKeyValueStore {
  failWrites = false;
  override async setItem(key: string, value: string): Promise<void> {
    if (this.failWrites) throw new Error('disk full');
    return super.setItem(key, value);
  }
}

function setup(initial: readonly ReturnType<typeof pin>[] = []) {
  const keyValueStore = new SwitchableStore({ [CUSTOM_MARKERS_KEY]: JSON.stringify(initial) });
  const store = createTestStore(createTestDependencies({ keyValueStore }));
  return { store, keyValueStore, map: () => store.getState().map };
}

describe('mapSlice edge cases', () => {
  it('keeps the pin on screen and in storage when removing it cannot be saved', async () => {
    const { store, keyValueStore, map } = setup([pin('p1', 48.86)]);
    await store.dispatch(loadCustomMarkers());
    keyValueStore.failWrites = true;

    await store.dispatch(removeCustomMarker('p1'));

    expect(map().customMarkers.map((marker) => marker.id)).toEqual(['p1']);
    expect(map().notice).toBe('pinSaveFailed');
  });

  it('clears the pin-limit notice once a later change is saved', async () => {
    const full = Array.from({ length: 50 }, (_, index) => pin(`p${index}`, 48 + index / 100));
    const { store, map } = setup(full);
    await store.dispatch(loadCustomMarkers());

    await store.dispatch(addCustomMarker({ latitude: 49.5, longitude: 2.4 }));
    expect(map().notice).toBe('pinLimit');

    await store.dispatch(removeCustomMarker('p0'));
    expect(map().notice).toBeNull();
    expect(map().customMarkers).toHaveLength(49);
  });

  it('ignores an invalid long-press position without a notice or a save', async () => {
    const { store, keyValueStore, map } = setup();
    await store.dispatch(loadCustomMarkers());

    await store.dispatch(addCustomMarker({ latitude: Number.NaN, longitude: 2.3 }));

    expect(map().customMarkers).toEqual([]);
    expect(map().notice).toBeNull();
    expect(keyValueStore.data.get(CUSTOM_MARKERS_KEY)).toBe('[]');
  });

  it('loads saved pins only once even when asked twice (screen remounts)', async () => {
    const { store, map } = setup([pin('p1', 48.86)]);

    await Promise.all([store.dispatch(loadCustomMarkers()), store.dispatch(loadCustomMarkers())]);
    await store.dispatch(addCustomMarker({ latitude: 48.9, longitude: 2.4 }));
    await store.dispatch(loadCustomMarkers());

    expect(map().customMarkers).toHaveLength(2);
  });
});
