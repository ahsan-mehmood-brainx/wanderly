import { AxiosError, AxiosHeaders, CanceledError, type InternalAxiosRequestConfig } from 'axios';

import { ApiError, kindForStatus } from './ApiError';
import { normalizeHttpError, parseRetryAfter, toHeaderRecord } from './normalizeHttpError';

/** Every key and string reachable through own properties, enumerable or not (as a crash reporter might serialise it). */
function reachableStrings(value: unknown, seen = new Set<unknown>()): string[] {
  if (typeof value === 'string') return [value];
  if (value === null || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);
  return Object.getOwnPropertyNames(value).flatMap((key) => [
    key,
    ...reachableStrings((value as Record<string, unknown>)[key], seen),
  ]);
}

describe('normalizeHttpError', () => {
  it('passes ApiErrors through unchanged (idempotent)', () => {
    const error = new ApiError('offline', 'offline');
    expect(normalizeHttpError(error)).toBe(error);
  });

  it('classifies cancellations', () => {
    expect(normalizeHttpError(new CanceledError()).kind).toBe('cancelled');
  });

  it('classifies both timeout codes', () => {
    expect(normalizeHttpError(new AxiosError('x', AxiosError.ETIMEDOUT)).kind).toBe('timeout');
    expect(normalizeHttpError(new AxiosError('timeout of 10ms exceeded', AxiosError.ECONNABORTED)).kind).toBe(
      'timeout',
    );
    expect(normalizeHttpError(new AxiosError('Request aborted', AxiosError.ECONNABORTED)).kind).toBe('network');
  });

  it('keeps request context and a sanitised copy of the original error as cause', () => {
    const original = new AxiosError('Network Error', AxiosError.ERR_NETWORK);
    const error = normalizeHttpError(original, { method: 'GET', url: '/x', requestId: 'r1' });
    expect(error).toMatchObject({ kind: 'network', method: 'GET', url: '/x', requestId: 'r1', code: 'ERR_NETWORK' });
    expect(error.cause).toBeInstanceOf(Error);
    expect(error.cause).not.toBe(original);
    expect(error.cause).toMatchObject({ name: 'AxiosError', message: 'Network Error', code: 'ERR_NETWORK' });
    expect(error.retryable).toBe(true);
  });

  it('never carries query-string credentials through the cause chain', () => {
    const secret = 'query-api-key-value';
    const config: InternalAxiosRequestConfig = {
      url: '/places',
      params: { api_key: secret },
      headers: new AxiosHeaders(),
    };
    const response = { status: 500, statusText: '', data: {}, headers: {}, config };
    const errors = [
      normalizeHttpError(new AxiosError('Request failed', AxiosError.ERR_BAD_RESPONSE, config, {}, response)),
      normalizeHttpError(new AxiosError('Network Error', AxiosError.ERR_NETWORK, config)),
      normalizeHttpError(new CanceledError(undefined, undefined, config)),
    ];

    for (const error of errors) {
      expect(error.cause).not.toHaveProperty('config');
      expect(error.cause).not.toHaveProperty('request');
      expect(error.cause).not.toHaveProperty('response');
      expect(reachableStrings(error)).not.toContain(secret);
    }
  });

  it('wraps non-axios values as unknown', () => {
    expect(normalizeHttpError(new TypeError('bad')).kind).toBe('unknown');
    expect(normalizeHttpError('weird').message).toBe('Unexpected request failure');
  });
});

describe('kindForStatus', () => {
  it.each([
    [400, 'badRequest'],
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'notFound'],
    [408, 'timeout'],
    [410, 'notFound'],
    [429, 'rateLimited'],
    [500, 'server'],
    [503, 'server'],
    [302, 'unknown'],
  ] as const)('%i → %s', (status, kind) => {
    expect(kindForStatus(status)).toBe(kind);
  });
});

describe('ApiError.retryable', () => {
  it('is true only for transient kinds', () => {
    expect(new ApiError('server', '').retryable).toBe(true);
    expect(new ApiError('rateLimited', '').retryable).toBe(true);
    expect(new ApiError('notFound', '').retryable).toBe(false);
    expect(new ApiError('parse', '').retryable).toBe(false);
    expect(new ApiError('cancelled', '').retryable).toBe(false);
  });
});

describe('parseRetryAfter', () => {
  it('reads delay-seconds and HTTP dates', () => {
    expect(parseRetryAfter('3', 0)).toBe(3_000);
    expect(parseRetryAfter('Thu, 01 Jan 1970 00:00:05 GMT', 1_000)).toBe(4_000);
    expect(parseRetryAfter('Thu, 01 Jan 1970 00:00:00 GMT', 1_000)).toBe(0);
  });

  it('ignores missing or invalid values', () => {
    expect(parseRetryAfter(undefined, 0)).toBeUndefined();
    expect(parseRetryAfter('soon', 0)).toBeUndefined();
  });
});

describe('toHeaderRecord', () => {
  it('lower-cases names and flattens values', () => {
    expect(toHeaderRecord({ 'Content-Type': 'json', 'Set-Cookie': ['a', 'b'], Empty: undefined })).toEqual({
      'content-type': 'json',
      'set-cookie': 'a, b',
    });
  });
});
