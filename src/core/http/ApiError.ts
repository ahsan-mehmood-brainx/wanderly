import { AppError, type AppErrorKind } from '@/core/errors/AppError';
import { type LogContext } from '@/core/logging/Logger';

import { type HttpMethod } from './HttpClient';

const RETRYABLE_KINDS: ReadonlySet<AppErrorKind> = new Set(['network', 'timeout', 'server', 'rateLimited']);

export interface ApiErrorDetails {
  readonly status?: number;
  /** Transport error code (e.g. `ERR_NETWORK`, `ETIMEDOUT`). */
  readonly code?: string;
  readonly method?: HttpMethod;
  /** Path relative to the base URL. Never includes query parameters (they may carry API keys). */
  readonly url?: string;
  readonly requestId?: string;
  /** From a `Retry-After` header, when the server sent one. */
  readonly retryAfterMs?: number;
  /** The server's own error text, for logs only; never shown to users. */
  readonly serverMessage?: string;
  readonly cause?: unknown;
}

/**
 * Standard error model for every HTTP failure. It is an {@link AppError}, so the
 * rest of the app handles it through the same `kind` taxonomy as any other failure;
 * the extra fields exist for retries, logging and debugging.
 */
export class ApiError extends AppError {
  readonly status: number | undefined;
  readonly code: string | undefined;
  readonly method: HttpMethod | undefined;
  readonly url: string | undefined;
  readonly requestId: string | undefined;
  readonly retryAfterMs: number | undefined;
  readonly serverMessage: string | undefined;

  constructor(kind: AppErrorKind, message: string, details: ApiErrorDetails = {}) {
    super(kind, message, { cause: details.cause });
    this.name = 'ApiError';
    this.status = details.status;
    this.code = details.code;
    this.method = details.method;
    this.url = details.url;
    this.requestId = details.requestId;
    this.retryAfterMs = details.retryAfterMs;
    this.serverMessage = details.serverMessage;
  }

  /** Whether trying again could succeed (transient network, timeout, 5xx, 429). */
  get retryable(): boolean {
    return RETRYABLE_KINDS.has(this.kind);
  }

  toLogContext(): LogContext {
    return {
      kind: this.kind,
      status: this.status,
      code: this.code,
      method: this.method,
      url: this.url,
      requestId: this.requestId,
      serverMessage: this.serverMessage,
    };
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Maps an HTTP status to the app's error taxonomy. */
export function kindForStatus(status: number): AppErrorKind {
  if (status >= 500) return 'server';
  switch (status) {
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
    case 410:
      return 'notFound';
    case 408:
      return 'timeout';
    case 429:
      return 'rateLimited';
    default:
      return status >= 400 ? 'badRequest' : 'unknown';
  }
}
