import { type KeyValueStore } from '@/core/storage/KeyValueStore';

/** Test double for KeyValueStore. Exposes its contents for assertions. */
export class InMemoryKeyValueStore implements KeyValueStore {
  readonly data = new Map<string, string>();

  constructor(initial: Readonly<Record<string, string>> = {}) {
    for (const [key, value] of Object.entries(initial)) this.data.set(key, value);
  }

  async getItem(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.data.delete(key);
  }
}
