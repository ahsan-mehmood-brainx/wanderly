/**
 * Encrypted key-value persistence port for secrets (auth tokens). Backed by the
 * iOS Keychain / Android Keystore in production. Never back it with AsyncStorage:
 * that is plain, unencrypted storage.
 *
 * Keys may only contain letters, digits, `.`, `-` and `_`. Keep values small
 * (well under 2 KB): some platforms reject large entries.
 */
export interface SecureKeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
