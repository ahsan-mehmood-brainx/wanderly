import { z } from 'zod';

import { AppError } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { err, ok, type Result } from '@/core/result';
import { type KeyValueStore } from '@/core/storage/KeyValueStore';
import { type SecureKeyValueStore } from '@/core/storage/SecureKeyValueStore';

import { type AuthSession } from '../domain/AuthSession';
import { type SessionRepository } from '../domain/SessionRepository';

/** Secure-storage key for the session (tokens + profile, about 1.2 KB). */
export const SESSION_SECURE_KEY = 'auth.session.v1';
/** Plain-storage flag recording that this installation saved a session. Holds no secret. */
export const SESSION_MARKER_KEY = 'auth.sessionMarker.v1';

const storedSessionSchema = z.object({
  user: z.object({
    id: z.number(),
    username: z.string(),
    email: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    imageUrl: z.string().nullable(),
  }),
  tokens: z.object({
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
    accessTokenExpiresAt: z.number(),
    refreshTokenExpiresAt: z.number().nullable(),
  }),
});

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * Persists the session in encrypted storage only.
 *
 * **Reinstalls:** the iOS Keychain outlives the app, so a reinstalled app could
 * silently sign the previous owner back in. A marker in plain app storage (which
 * *is* wiped on uninstall) records that this installation saved the session. A
 * session found without its marker is left over from an earlier install and is discarded.
 */
export class SecureSessionRepository implements SessionRepository {
  constructor(
    private readonly secureStore: SecureKeyValueStore,
    private readonly keyValueStore: KeyValueStore,
    private readonly logger: Logger,
  ) {}

  async load(): Promise<Result<AuthSession | null, AppError>> {
    let raw: string | null;
    try {
      raw = await this.secureStore.getItem(SESSION_SECURE_KEY);
    } catch (cause) {
      return err(new AppError('storage', 'Failed to read the session from secure storage', { cause }));
    }
    if (raw === null) return ok(null);

    if (!(await this.hasMarker())) {
      this.logger.info('Discarding a session left by a previous installation');
      await this.discard();
      return ok(null);
    }

    const parsed = storedSessionSchema.safeParse(parseJson(raw));
    if (!parsed.success) {
      this.logger.warn('Stored session was unreadable; discarding it');
      await this.discard();
      return ok(null);
    }
    return ok(parsed.data);
  }

  async save(session: AuthSession): Promise<Result<void, AppError>> {
    try {
      await this.secureStore.setItem(SESSION_SECURE_KEY, JSON.stringify(session));
    } catch (cause) {
      return err(new AppError('storage', 'Failed to save the session to secure storage', { cause }));
    }
    try {
      await this.keyValueStore.setItem(SESSION_MARKER_KEY, '1');
    } catch (cause) {
      // Not fatal now; on next launch the session would be treated as stale and the user signs in again.
      this.logger.warn('Could not record the session marker', { cause });
    }
    return ok(undefined);
  }

  async clear(): Promise<Result<void, AppError>> {
    try {
      await this.secureStore.removeItem(SESSION_SECURE_KEY);
    } catch (cause) {
      return err(new AppError('storage', 'Failed to remove the session from secure storage', { cause }));
    }
    try {
      await this.keyValueStore.removeItem(SESSION_MARKER_KEY);
    } catch (cause) {
      this.logger.warn('Could not remove the session marker', { cause });
    }
    return ok(undefined);
  }

  /** If plain storage can't be read, trust the secure entry rather than signing the user out. */
  private async hasMarker(): Promise<boolean> {
    try {
      return (await this.keyValueStore.getItem(SESSION_MARKER_KEY)) !== null;
    } catch {
      return true;
    }
  }

  private async discard(): Promise<void> {
    const cleared = await this.clear();
    if (!cleared.ok) this.logger.error('Could not discard the stored session', cleared.error);
  }
}
