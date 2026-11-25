import { AppError } from '@/core/errors/AppError';
import { ApiError } from '@/core/http/ApiError';

import { ExponentialSyncRetryPolicy } from './SyncRetryPolicy';

const policy = (value = 0.5) => new ExponentialSyncRetryPolicy({ random: () => value });

describe('ExponentialSyncRetryPolicy', () => {
  it('backs off exponentially from 5 s', () => {
    const delays = [1, 2, 3, 4].map((attempt) => policy().decide(attempt, new AppError('server', '500')));
    expect(delays).toEqual([5_000, 10_000, 20_000, 40_000].map((delayMs) => ({ retry: true, delayMs })));
  });

  it('caps the delay at 30 minutes', () => {
    const decision = new ExponentialSyncRetryPolicy({ random: () => 0.5, maxAttempts: 50 }).decide(
      20,
      new AppError('server', '500'),
    );
    expect(decision).toEqual({ retry: true, delayMs: 30 * 60_000 });
  });

  it('spreads delays by up to ±20 %', () => {
    expect(policy(0).decide(1, new AppError('timeout', 't'))).toEqual({ retry: true, delayMs: 4_000 });
    expect(policy(1).decide(1, new AppError('timeout', 't'))).toEqual({ retry: true, delayMs: 6_000 });
  });

  it('waits at least as long as Retry-After', () => {
    const decision = policy().decide(1, new ApiError('rateLimited', '429', { status: 429, retryAfterMs: 90_000 }));
    expect(decision).toEqual({ retry: true, delayMs: 90_000 });
  });

  it.each(['badRequest', 'parse', 'forbidden', 'unauthorized', 'notFound', 'configuration'] as const)(
    'gives up at once on %s',
    (kind) => {
      expect(policy().decide(1, new AppError(kind, kind))).toEqual({ retry: false });
    },
  );

  it('gives up after the last attempt', () => {
    expect(policy().decide(7, new AppError('server', '500')).retry).toBe(true);
    expect(policy().decide(8, new AppError('server', '500'))).toEqual({ retry: false });
  });
});
