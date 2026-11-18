import { type SecureKeyValueStore } from './SecureKeyValueStore';

/**
 * Process-memory store for platforms without secure storage (web). Secrets live
 * only as long as the page, so a web session ends on reload: the deliberate
 * trade-off for never writing tokens to `localStorage`.
 */
export class MemorySecureKeyValueStore implements SecureKeyValueStore {
  private readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}
