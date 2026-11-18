import * as SecureStore from 'expo-secure-store';

import { ExpoSecureKeyValueStore } from './ExpoSecureKeyValueStore';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 7,
  getItemAsync: jest.fn(() => Promise.resolve('value')),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

describe('ExpoSecureKeyValueStore', () => {
  it('namespaces keys and keeps entries on this device only', async () => {
    const store = new ExpoSecureKeyValueStore('test');

    await store.setItem('auth.session', 'secret');
    await expect(store.getItem('auth.session')).resolves.toBe('value');
    await store.removeItem('auth.session');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('test.auth.session', 'secret', options);
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('test.auth.session', options);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('test.auth.session', options);
  });
});
