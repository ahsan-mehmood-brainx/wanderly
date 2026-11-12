import * as SecureStore from 'expo-secure-store';

import { type SecureKeyValueStore } from './SecureKeyValueStore';

/**
 * Tokens are readable only while the device is unlocked, and never migrate to
 * another device through backups. Android Auto Backup already excludes SecureStore
 * data (the config plugin's default).
 */
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** expo-secure-store adapter (Keychain on iOS, Keystore-encrypted storage on Android). Keys are namespaced. */
export class ExpoSecureKeyValueStore implements SecureKeyValueStore {
  constructor(private readonly namespace: string = 'wanderly') {}

  private key(key: string): string {
    return `${this.namespace}.${key}`;
  }

  getItem(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(this.key(key), OPTIONS);
  }

  setItem(key: string, value: string): Promise<void> {
    return SecureStore.setItemAsync(this.key(key), value, OPTIONS);
  }

  removeItem(key: string): Promise<void> {
    return SecureStore.deleteItemAsync(this.key(key), OPTIONS);
  }
}
