/**
 * Minimal async key-value persistence port for small, non-sensitive data
 * (preferences, flags). Large or relational data belongs in SQLite and
 * secrets belong in SecureStore, each behind their own abstraction.
 */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
