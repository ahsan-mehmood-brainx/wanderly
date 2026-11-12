import { type AppErrorKind } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { err, ok, type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';
import { type Clock } from '@/core/utils/Clock';

import { type AuthRepository } from '../AuthRepository';
import { type AuthUser } from '../AuthUser';
import { hasFieldErrors, normalizeCredentials, validateCredentials, type Credentials } from '../Credentials';
import { type LoginAttemptLimiter } from '../LoginAttemptLimiter';
import { type SessionManager } from '../SessionManager';

export interface SignInInput {
  readonly credentials: Credentials;
  readonly signal?: AbortSignal;
}

export interface SignInFailure {
  readonly kind: AppErrorKind;
  /** Set while repeated failures have paused sign-in (epoch ms). */
  readonly lockedUntil: number | null;
}

export class SignIn implements UseCase<SignInInput, Result<AuthUser, SignInFailure>> {
  constructor(
    private readonly authRepository: Pick<AuthRepository, 'login'>,
    private readonly sessionManager: Pick<SessionManager, 'start'>,
    private readonly limiter: LoginAttemptLimiter,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async execute({ credentials, signal }: SignInInput): Promise<Result<AuthUser, SignInFailure>> {
    const lockedUntil = this.limiter.lockedUntil(this.clock.now());
    if (lockedUntil !== null) return err({ kind: 'rateLimited', lockedUntil });

    const normalized = normalizeCredentials(credentials);
    // The form validates first; this guards other callers from sending a request that can only fail.
    if (hasFieldErrors(validateCredentials(normalized))) return err({ kind: 'invalidCredentials', lockedUntil: null });

    const result = await this.authRepository.login(normalized, signal);
    if (!result.ok) {
      if (result.error.kind === 'invalidCredentials') this.limiter.recordFailure(this.clock.now());
      return err({ kind: result.error.kind, lockedUntil: this.limiter.lockedUntil(this.clock.now()) });
    }

    this.limiter.reset();
    const persisted = await this.sessionManager.start(result.value);
    if (!persisted.ok) {
      this.logger.error(
        'Signed in, but the session could not be saved securely; it ends when the app closes',
        persisted.error,
      );
    }
    return ok(result.value.user);
  }
}
