import { ApiError } from '../ApiError';
import { ApiKeyAuth, BearerTokenAuth, noAuth } from './AuthStrategy';
import { ExponentialBackoffRetry, noRetry } from './RetryStrategy';

const serverError = new ApiError('server', 'down', { status: 503 });

describe('ExponentialBackoffRetry', () => {
  const retry = (jitter = 0) =>
    new ExponentialBackoffRetry({ maxRetries: 3, baseDelayMs: 100, maxDelayMs: 1_000, random: () => jitter });

  it('doubles the delay ceiling each attempt with equal jitter, capped at maxDelay', () => {
    const delays = (random: number) =>
      [1, 2, 3].map((attempt) => retry(random).getDelayMs({ attempt, error: serverError, method: 'GET' }));
    expect(delays(0)).toEqual([50, 100, 200]);
    expect(delays(1)).toEqual([100, 200, 400]);

    const capped = new ExponentialBackoffRetry({
      maxRetries: 10,
      baseDelayMs: 100,
      maxDelayMs: 1_000,
      random: () => 1,
    });
    expect(capped.getDelayMs({ attempt: 8, error: serverError, method: 'GET' })).toBe(1_000);
  });

  it('stops once the retry budget is spent', () => {
    expect(retry().getDelayMs({ attempt: 4, error: serverError, method: 'GET' })).toBeNull();
  });

  it('only retries retryable errors on idempotent methods', () => {
    expect(retry().getDelayMs({ attempt: 1, error: new ApiError('notFound', ''), method: 'GET' })).toBeNull();
    expect(retry().getDelayMs({ attempt: 1, error: serverError, method: 'POST' })).toBeNull();
    expect(retry().getDelayMs({ attempt: 1, error: serverError, method: 'PATCH' })).toBeNull();
    expect(retry().getDelayMs({ attempt: 1, error: serverError, method: 'PUT' })).not.toBeNull();
  });

  it('uses Retry-After when present, and gives up if it exceeds the cap', () => {
    const limited = (retryAfterMs: number) => new ApiError('rateLimited', '', { status: 429, retryAfterMs });
    expect(retry().getDelayMs({ attempt: 1, error: limited(700), method: 'GET' })).toBe(700);
    expect(retry().getDelayMs({ attempt: 1, error: limited(60_000), method: 'GET' })).toBeNull();
  });
});

describe('noRetry', () => {
  it('never retries', () => {
    expect(noRetry.getDelayMs({ attempt: 1, error: serverError, method: 'GET' })).toBeNull();
  });
});

describe('auth strategies', () => {
  it('noAuth adds nothing', () => {
    expect(noAuth.getCredentials()).toEqual({});
  });

  it('ApiKeyAuth places the key in a header or the query string', () => {
    expect(new ApiKeyAuth({ name: 'X-Api-Key', value: 'k', location: 'header' }).getCredentials()).toEqual({
      headers: { 'X-Api-Key': 'k' },
    });
    expect(new ApiKeyAuth({ name: 'apikey', value: 'k', location: 'query' }).getCredentials()).toEqual({
      query: { apikey: 'k' },
    });
  });

  it('BearerTokenAuth reads the token per request and omits the header without one', async () => {
    let token: string | null = 'first';
    const auth = new BearerTokenAuth(() => token);

    await expect(auth.getCredentials()).resolves.toEqual({ headers: { Authorization: 'Bearer first' } });
    token = null;
    await expect(auth.getCredentials()).resolves.toEqual({});
  });
});
