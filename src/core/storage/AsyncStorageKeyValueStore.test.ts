import AsyncStorage from '@react-native-async-storage/async-storage';

import { AsyncStorageKeyValueStore } from './AsyncStorageKeyValueStore';

describe('AsyncStorageKeyValueStore', () => {
  beforeEach(() => AsyncStorage.clear());

  it('namespaces keys and round-trips values', async () => {
    const store = new AsyncStorageKeyValueStore('test');

    await store.setItem('greeting', 'hola');

    expect(await store.getItem('greeting')).toBe('hola');
    expect(await AsyncStorage.getItem('@test/greeting')).toBe('hola');
    expect(await AsyncStorage.getItem('greeting')).toBeNull();
  });

  it('removes values', async () => {
    const store = new AsyncStorageKeyValueStore('test');
    await store.setItem('greeting', 'hola');

    await store.removeItem('greeting');

    expect(await store.getItem('greeting')).toBeNull();
  });
});
