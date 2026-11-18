import { type Logger } from '@/core/logging/Logger';
import { type UseCase } from '@/core/usecase/UseCase';
import { TIMED_OUT, withTimeout } from '@/core/utils/async';

import { type AuthUser } from '../AuthUser';
import { type SessionManager } from '../SessionManager';
import { type SessionRepository } from '../SessionRepository';

export type SignedOutReason =
  /** Nothing stored: first launch, or the user signed out. */
  | 'noSession'
  /** A session was stored but the server will no longer renew it. */
  | 'sessionExpired'
  /** Secure storage could not be read. */
  | 'restoreFailed';

export type RestoreOutcome =
  | { readonly kind: 'signedIn'; readonly user: AuthUser }
  | { readonly kind: 'signedOut'; readonly reason: SignedOutReason };

/** Start-up waits on this; a hung keychain read must not hold the launch screen forever. */
export const SESSION_READ_TIMEOUT_MS = 5000;

/**
 * Restores the previous session at launch. Never throws.
 *
 * - Valid access token: signed in immediately, with no network round trip.
 * - Expired access token: renewed first. If the server refuses, the user signs in again (`sessionExpired`).
 * - Renewal impossible right now (offline, timeout): stay signed in. A travel app must open
 *   on a plane; the token is renewed on the next request or when the app returns to the foreground.
 * - Unreadable storage: signed out, with an explanation (`restoreFailed`).
 */
export class RestoreSession implements UseCase<void, RestoreOutcome> {
  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly sessionManager: Pick<SessionManager, 'adopt' | 'isAccessTokenExpired' | 'refresh'>,
    private readonly logger: Logger,
    private readonly timeoutMs: number = SESSION_READ_TIMEOUT_MS,
  ) {}

  async execute(): Promise<RestoreOutcome> {
    let stored;
    try {
      stored = await withTimeout(this.sessionRepository.load(), this.timeoutMs);
    } catch (error) {
      this.logger.error('Session repository threw while restoring', error);
      return { kind: 'signedOut', reason: 'restoreFailed' };
    }

    if (stored === TIMED_OUT) {
      this.logger.warn('Reading the stored session timed out', { timeoutMs: this.timeoutMs });
      return { kind: 'signedOut', reason: 'restoreFailed' };
    }
    if (!stored.ok) {
      this.logger.error('Could not read the stored session', stored.error);
      return { kind: 'signedOut', reason: 'restoreFailed' };
    }

    const session = stored.value;
    if (!session) return { kind: 'signedOut', reason: 'noSession' };

    this.sessionManager.adopt(session);
    if (!this.sessionManager.isAccessTokenExpired()) return { kind: 'signedIn', user: session.user };

    const outcome = await this.sessionManager.refresh();
    switch (outcome.kind) {
      case 'refreshed':
        return { kind: 'signedIn', user: outcome.session.user };
      case 'expired':
        return { kind: 'signedOut', reason: 'sessionExpired' };
      case 'unavailable':
        return { kind: 'signedIn', user: session.user };
    }
  }
}
