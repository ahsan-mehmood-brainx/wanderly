import { AxiosError, isAxiosError, isCancel } from 'axios';

import { ApiError, type ApiErrorDetails, kindForStatus } from './ApiError';
import { type HttpMethod } from './HttpClient';

export interface RequestContext {
  readonly method?: HttpMethod;
  readonly url?: string;
  readonly requestId?: string;
}

const MAX_SERVER_MESSAGE_LENGTH = 200;

/** Lower-cases header names and stringifies values; works for both axios header shapes. */
export function toHeaderRecord(headers: unknown): Record<string, string> {
  const record: Record<string, string> = {};
  if (headers === null || typeof headers !== 'object') return record;
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || value === null || typeof value === 'function') continue;
    record[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return record;
}

/** `Retry-After` is either delay-seconds or an HTTP date. */
export function parseRetryAfter(value: string | undefined, nowMs: number): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - nowMs);
}

function extractServerMessage(data: unknown): string | undefined {
  let message: unknown = data;
  if (data !== null && typeof data === 'object') {
    const body = data as Record<string, unknown>;
    message = body.message ?? body.error ?? body.detail;
  }
  return typeof message === 'string' && message.trim() ? message.trim().slice(0, MAX_SERVER_MESSAGE_LENGTH) : undefined;
}

/**
 * A copy of an axios error carrying only its name, message, code and stack. The
 * original holds the request config, whose `params` can carry query-string API
 * keys, and `redact()` does not walk Error objects, so it must never be kept as a `cause`.
 */
function sanitizedCause(error: { name?: string; message?: string; code?: string; stack?: string }): Error {
  const cause = new Error(error.message ?? 'Request failed');
  cause.name = error.name ?? 'AxiosError';
  if (error.stack) cause.stack = error.stack;
  return Object.assign(cause, { code: error.code });
}

function contextFromAxios(error: AxiosError, context: RequestContext): RequestContext {
  const method = error.config?.method?.toUpperCase() as HttpMethod | undefined;
  return {
    method: context.method ?? method,
    url: context.url ?? error.config?.url,
    requestId: context.requestId ?? error.config?.metadata?.requestId,
  };
}

/**
 * The single place where transport failures become {@link ApiError}s. Every
 * interceptor and client funnels errors through here, so classification is
 * consistent and no axios type escapes the HTTP layer. Idempotent: an ApiError
 * passes through unchanged.
 */
export function normalizeHttpError(
  error: unknown,
  context: RequestContext = {},
  now: () => number = Date.now,
): ApiError {
  if (error instanceof ApiError) return error;

  if (isCancel(error)) {
    return new ApiError('cancelled', 'Request was cancelled', {
      ...context,
      code: AxiosError.ERR_CANCELED,
      cause: sanitizedCause(error as AxiosError),
    });
  }

  if (isAxiosError(error)) {
    const details: ApiErrorDetails = {
      ...contextFromAxios(error, context),
      code: error.code,
      cause: sanitizedCause(error),
    };

    if (error.response) {
      const { status, data, headers } = error.response;
      return new ApiError(kindForStatus(status), `Request failed with status ${status}`, {
        ...details,
        status,
        retryAfterMs: parseRetryAfter(toHeaderRecord(headers)['retry-after'], now()),
        serverMessage: extractServerMessage(data),
      });
    }

    const timedOut =
      error.code === AxiosError.ETIMEDOUT || (error.code === AxiosError.ECONNABORTED && /timeout/i.test(error.message));
    if (timedOut) return new ApiError('timeout', 'Request timed out', details);

    // No response: DNS failure, connection refused/reset, TLS error, CORS on web.
    return new ApiError('network', 'Network request failed', details);
  }

  return new ApiError('unknown', error instanceof Error ? error.message : 'Unexpected request failure', {
    ...context,
    cause: error,
  });
}
