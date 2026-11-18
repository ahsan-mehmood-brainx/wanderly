import { type AppError, type AppErrorKind } from '@/core/errors/AppError';
import { Subject, type Unsubscribe } from '@/core/events/Subject';
import { type Logger } from '@/core/logging/Logger';
import { type Result } from '@/core/result';
import { type Clock } from '@/core/utils/Clock';

import { type AuthRepository } from './AuthRepository';
import {
  ACCESS_TOKEN_EXPIRY_SKEW_MS,
  isAccessTokenExpired,
  isRefreshTokenExpired,
  type AuthSession,
} from './AuthSession';
import { type AuthUser } from './AuthUser';
import { type SessionRepository } from './SessionRepository';

export type RefreshOutcome =
  | { readonly kind: 'refreshed'; readonly session: AuthSession }
  /** The server will not renew the session: it has been ended and `onExpired` listeners notified. */
  | { readonly kind: 'expired' }
  /** Renewal could not be attempted (offline, timeout, server down). The session is kept for a later retry. */
  | { readonly kind: 'unavailable'; readonly error: AppError };

/** Refresh failures that mean "this session is over", as opposed to "try again later". */
const SESSION_REJECTED: ReadonlySet<AppErrorKind> = new Set([
  'sessionExpired',
  'unauthorized',
  'forbidden',
  'badRequest',
]);

export interface SessionManagerDependencies {
  readonly authRepository: Pick<AuthRepository, 'refresh'>;
  readonly sessionRepository: SessionRepository;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly skewMs?: number;
}

/**
 * Owns the live session (tokens included) for the app's lifetime. Tokens stay
 * here and in secure storage, never in Redux, so they can't leak through state
 * snapshots, logs or dev tools.
 *
 * - **Token provider:** `getValidAccessToken()` is what authenticated HTTP clients call per request.
 *   An expired access token is renewed first.
 * - **Single flight:** concurrent callers share one refresh request, so a burst of requests after
 *   the app wakes up never sends several refreshes (DummyJSON rotates refresh tokens).
 * - **Expiry:** when the server refuses to renew, the session is cleared everywhere and
 *   `onExpired` listeners run (the UI returns to sign-in with an explanation).
 * - **Races:** a refresh that settles after sign-out (or a new sign-in) is discarded.
 */
export class SessionManager {
  private session: AuthSession | null = null;
  private inFlightRefresh: Promise<RefreshOutcome> | null = null;
  private readonly expirations: Subject<void>;
  private readonly skewMs: number;

  constructor(private readonly deps: SessionManagerDependencies) {
    this.skewMs = deps.skewMs ?? ACCESS_TOKEN_EXPIRY_SKEW_MS;
    this.expirations = new Subject((error) => deps.logger.error('A session expiry listener threw', error));
  }

  get current(): AuthSession | null {
    return this.session;
  }

  onExpired(listener: () => void): Unsubscribe {
    return this.expirations.subscribe(listener);
  }

  /** Takes over a session restored from storage (it is already persisted). */
  adopt(session: AuthSession): void {
    this.session = session;
    this.inFlightRefresh = null;
  }

  /** Starts a newly signed-in session and persists it. If saving fails, the session still works until the app closes. */
  start(session: AuthSession): Promise<Result<void, AppError>> {
    this.adopt(session);
    return this.deps.sessionRepository.save(session);
  }

  /** Ends the session: memory first (so no further request can use it), then storage, retried once. */
  async end(): Promise<Result<void, AppError>> {
    this.session = null;
    this.inFlightRefresh = null;
    const cleared = await this.deps.sessionRepository.clear();
    return cleared.ok ? cleared : this.deps.sessionRepository.clear();
  }

  /** Replaces the profile kept with the session (e.g. after fetching fresh details). */
  async updateUser(user: AuthUser): Promise<void> {
    if (!this.session) return;
    this.session = { ...this.session, user };
    const saved = await this.deps.sessionRepository.save(this.session);
    if (!saved.ok) this.deps.logger.warn('Could not persist the updated profile', { kind: saved.error.kind });
  }

  isAccessTokenExpired(): boolean {
    return this.session !== null && isAccessTokenExpired(this.session.tokens, this.deps.clock.now(), this.skewMs);
  }

  /**
   * A token that is valid right now, renewing it first if needed. `null` when signed out
   * or the session just expired. If renewal is temporarily impossible, the stale token is
   * returned so the request fails with its own (connectivity) error rather than as signed-out.
   */
  async getValidAccessToken(): Promise<string | null> {
    if (!this.session) return null;
    if (!this.isAccessTokenExpired()) return this.session.tokens.accessToken;

    const outcome = await this.refresh();
    if (outcome.kind === 'refreshed') return outcome.session.tokens.accessToken;
    if (outcome.kind === 'unavailable') return this.session?.tokens.accessToken ?? null;
    return null;
  }

  /** Renews the access token now, sharing any refresh already in flight. */
  refresh(): Promise<RefreshOutcome> {
    if (!this.inFlightRefresh) {
      const pending = this.performRefresh().finally(() => {
        if (this.inFlightRefresh === pending) this.inFlightRefresh = null;
      });
      this.inFlightRefresh = pending;
    }
    return this.inFlightRefresh;
  }

  /**
   * Development aid for exercising expiry handling on a device without waiting for
   * real expiry. `accessToken` forces the next request to refresh; `session` also
   * invalidates the refresh token, so that refresh is rejected and the session ends.
   */
  simulateExpiry(scope: 'accessToken' | 'session'): void {
    if (!this.session) return;
    this.session = {
      ...this.session,
      tokens: {
        ...this.session.tokens,
        accessTokenExpiresAt: 0,
        refreshToken: scope === 'session' ? 'invalidated-for-testing' : this.session.tokens.refreshToken,
      },
    };
  }

  private async performRefresh(): Promise<RefreshOutcome> {
    const session = this.session;
    if (!session) return { kind: 'expired' };
    if (isRefreshTokenExpired(session.tokens, this.deps.clock.now()))
      return this.expire(session, 'refreshTokenExpired');

    const result = await this.deps.authRepository.refresh(session.tokens.refreshToken);

    // Signed out (or in as someone else) while the request was in flight: this result belongs to a dead session.
    if (this.session !== session) {
      return this.session ? { kind: 'refreshed', session: this.session } : { kind: 'expired' };
    }

    if (result.ok) {
      const renewed: AuthSession = { ...session, tokens: result.value };
      this.session = renewed;
      const saved = await this.deps.sessionRepository.save(renewed);
      if (!saved.ok) this.deps.logger.warn('Renewed the session but could not persist it', { kind: saved.error.kind });
      return { kind: 'refreshed', session: renewed };
    }

    if (SESSION_REJECTED.has(result.error.kind)) return this.expire(session, result.error.kind);

    this.deps.logger.warn('Could not renew the session; keeping it until the network recovers', {
      kind: result.error.kind,
    });
    return { kind: 'unavailable', error: result.error };
  }

  private async expire(session: AuthSession, reason: string): Promise<RefreshOutcome> {
    if (this.session !== session) return { kind: 'expired' };
    this.deps.logger.info('Session expired', { reason });
    const cleared = await this.end();
    if (!cleared.ok) this.deps.logger.error('Could not remove the expired session from secure storage', cleared.error);
    this.expirations.emit();
    return { kind: 'expired' };
  }
}
