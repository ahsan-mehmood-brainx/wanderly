import { AppError } from '@/core/errors/AppError';
import { err, type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';

import { type AuthRepository } from '../AuthRepository';
import { type AuthUser } from '../AuthUser';
import { type SessionManager } from '../SessionManager';

export interface FetchCurrentUserInput {
  readonly signal?: AbortSignal;
}

const sessionEnded = () => err(new AppError('sessionExpired', 'The session could not be renewed'));

/**
 * Loads the signed-in user's latest profile and keeps the stored copy current.
 *
 * A valid token is obtained before the request leaves (renewing an expired one, see
 * `SessionManager`); if there is no session or renewal is refused, nothing is sent.
 * If the server still answers 401 (token revoked, device clock wrong), the session is
 * renewed once and the request retried; if renewal is refused, the session has ended.
 */
export class FetchCurrentUser implements UseCase<FetchCurrentUserInput, Result<AuthUser, AppError>> {
  constructor(
    private readonly authRepository: Pick<AuthRepository, 'fetchCurrentUser'>,
    private readonly sessionManager: Pick<SessionManager, 'current' | 'getValidAccessToken' | 'refresh' | 'updateUser'>,
  ) {}

  async execute({ signal }: FetchCurrentUserInput = {}): Promise<Result<AuthUser, AppError>> {
    // Never send `/auth/me` without credentials: a null token means signed out or renewal refused.
    if ((await this.sessionManager.getValidAccessToken()) === null) return sessionEnded();

    let result = await this.authRepository.fetchCurrentUser(signal);

    if (!result.ok && result.error.kind === 'unauthorized') {
      // The session ended while the request was in flight (sign-out or expiry elsewhere).
      if (!this.sessionManager.current) return sessionEnded();
      const outcome = await this.sessionManager.refresh();
      if (outcome.kind === 'expired') return sessionEnded();
      if (outcome.kind === 'refreshed') result = await this.authRepository.fetchCurrentUser(signal);
    }

    if (result.ok) await this.sessionManager.updateUser(result.value);
    return result;
  }
}
