import { type ZodType } from 'zod';

import { type Result } from '@/core/result';

import { type ApiError } from './ApiError';
import { type RetryStrategy } from './strategies/RetryStrategy';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** `null` and `undefined` values are omitted from the query string. */
export type QueryParams = Readonly<Record<string, string | number | boolean | null | undefined>>;

export interface RequestOptions<T> {
  readonly query?: QueryParams;
  readonly headers?: Readonly<Record<string, string>>;
  /** Aborting cancels the in-flight attempt and any pending retry; the result is a `cancelled` error. */
  readonly signal?: AbortSignal;
  /** Per-attempt timeout; overrides the API's default. */
  readonly timeoutMs?: number;
  /** Overrides the API's retry strategy for this request (e.g. `noRetry` for a search-as-you-type). */
  readonly retry?: RetryStrategy;
  /**
   * Validates the response body; a mismatch becomes a `parse` error instead of bad data
   * leaking into the app. Strongly recommended: without it `data` is `unknown`
   * (or an unchecked `T` if the caller supplies one).
   */
  readonly schema?: ZodType<T>;
}

export interface RequestConfig<T> extends RequestOptions<T> {
  readonly method: HttpMethod;
  /** Relative to the API's base URL. */
  readonly path: string;
  readonly body?: unknown;
}

/** Standard success envelope for every HTTP call, whatever the API returned. */
export interface ApiResponse<T> {
  readonly data: T;
  readonly status: number;
  /** Lower-cased header names. */
  readonly headers: Readonly<Record<string, string>>;
  /** Correlates logs for every attempt of this request. */
  readonly requestId: string;
  /** Total time including retries. */
  readonly durationMs: number;
  readonly attempts: number;
}

/** HTTP calls never throw: success and failure are both values the caller must handle. */
export type ApiResult<T> = Result<ApiResponse<T>, ApiError>;

/**
 * Facade over the networking stack. Repositories see five verbs and a Result;
 * the transport (axios), interceptors, auth, retries, timeouts, cancellation,
 * validation and error mapping all stay behind this interface.
 */
export interface HttpClient {
  request<T = unknown>(config: RequestConfig<T>): Promise<ApiResult<T>>;
  get<T = unknown>(path: string, options?: RequestOptions<T>): Promise<ApiResult<T>>;
  post<T = unknown>(path: string, body?: unknown, options?: RequestOptions<T>): Promise<ApiResult<T>>;
  put<T = unknown>(path: string, body?: unknown, options?: RequestOptions<T>): Promise<ApiResult<T>>;
  patch<T = unknown>(path: string, body?: unknown, options?: RequestOptions<T>): Promise<ApiResult<T>>;
  delete<T = unknown>(path: string, options?: RequestOptions<T>): Promise<ApiResult<T>>;
}

/** Implements the convenience verbs once in terms of `request`, for every HttpClient (real or fake). */
export abstract class BaseHttpClient implements HttpClient {
  abstract request<T = unknown>(config: RequestConfig<T>): Promise<ApiResult<T>>;

  get<T = unknown>(path: string, options: RequestOptions<T> = {}): Promise<ApiResult<T>> {
    return this.request<T>({ ...options, method: 'GET', path });
  }

  post<T = unknown>(path: string, body?: unknown, options: RequestOptions<T> = {}): Promise<ApiResult<T>> {
    return this.request<T>({ ...options, method: 'POST', path, body });
  }

  put<T = unknown>(path: string, body?: unknown, options: RequestOptions<T> = {}): Promise<ApiResult<T>> {
    return this.request<T>({ ...options, method: 'PUT', path, body });
  }

  patch<T = unknown>(path: string, body?: unknown, options: RequestOptions<T> = {}): Promise<ApiResult<T>> {
    return this.request<T>({ ...options, method: 'PATCH', path, body });
  }

  delete<T = unknown>(path: string, options: RequestOptions<T> = {}): Promise<ApiResult<T>> {
    return this.request<T>({ ...options, method: 'DELETE', path });
  }
}
