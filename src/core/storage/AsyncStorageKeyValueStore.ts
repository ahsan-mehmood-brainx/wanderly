import AsyncStorage from '@react-native-async-storage/async-storage';

import { type KeyValueStore } from './KeyValueStore';

/** AsyncStorage adapter. Keys are namespaced so the app never collides with library keys. */
export class AsyncStorageKeyValueStore implements KeyValueStore {
  constructor(private readonly namespace: string = 'wanderly') {}

  private key(key: string): string {
    return `@${this.namespace}/${key}`;
  }

  getItem(key: string): Promise<string | null> {
    return AsyncStorage.getItem(this.key(key));
  }

  setItem(key: string, value: string): Promise<void> {
    return AsyncStorage.setItem(this.key(key), value);
  }

  removeItem(key: string): Promise<void> {
    return AsyncStorage.removeItem(this.key(key));
  }
}
