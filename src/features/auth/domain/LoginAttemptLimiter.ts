export interface LoginAttemptLimiterOptions {
  /** Consecutive rejected attempts allowed before a cooldown. */
  readonly maxAttempts: number;
  readonly lockoutMs: number;
}

export const DEFAULT_LOGIN_ATTEMPT_LIMITS: LoginAttemptLimiterOptions = { maxAttempts: 5, lockoutMs: 30_000 };

/**
 * Client-side brake on repeated failed sign-ins: after `maxAttempts` wrong passwords
 * in a row, sign-in pauses for `lockoutMs`. Only credential rejections count; a
 * network failure says nothing about the password. Held in memory, so it is a UX
 * guard against hammering the server, not a security boundary (that is the server's job).
 */
export class LoginAttemptLimiter {
  private failures = 0;
  private lockedUntilAt: number | null = null;

  constructor(private readonly options: LoginAttemptLimiterOptions = DEFAULT_LOGIN_ATTEMPT_LIMITS) {}

  /** End of the current cooldown (epoch ms), or `null` if sign-in is allowed. */
  lockedUntil(now: number): number | null {
    return this.lockedUntilAt !== null && this.lockedUntilAt > now ? this.lockedUntilAt : null;
  }

  recordFailure(now: number): void {
    this.failures += 1;
    if (this.failures >= this.options.maxAttempts) {
      this.lockedUntilAt = now + this.options.lockoutMs;
      this.failures = 0;
    }
  }

  reset(): void {
    this.failures = 0;
    this.lockedUntilAt = null;
  }
}
