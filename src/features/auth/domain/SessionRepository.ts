import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';

import { type AuthSession } from './AuthSession';

/** Device persistence for the session. Implementations must store tokens in encrypted storage only. */
export interface SessionRepository {
  /**
   * `ok(null)` when there is no usable session (never signed in, signed out, or the
   * stored value was unreadable and has been discarded). Fails only if storage itself fails.
   */
  load(): Promise<Result<AuthSession | null, AppError>>;
  save(session: AuthSession): Promise<Result<void, AppError>>;
  clear(): Promise<Result<void, AppError>>;
}
