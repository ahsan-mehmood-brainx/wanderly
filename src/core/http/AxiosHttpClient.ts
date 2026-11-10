import { type AxiosInstance, type AxiosResponse } from 'axios';

import { type Logger } from '@/core/logging/Logger';
import { err, ok } from '@/core/result';
import { sleep as defaultSleep } from '@/core/utils/async';
import { type Clock } from '@/core/utils/Clock';
import { type IdGenerator } from '@/core/utils/IdGenerator';

import { ApiError } from './ApiError';
import { type ApiResult, BaseHttpClient, type RequestConfig } from './HttpClient';
import { normalizeHttpError, toHeaderRecord } from './normalizeHttpError';
import { type RetryStrategy } from './strategies/RetryStrategy';

export interface AxiosHttpClientOptions {
  readonly retry: RetryStrategy;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  readonly logger: Logger;
  /** Injectable so tests don't wait for real backoff delays. */
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<boolean>;
}

/**
 * Adapter from axios to the app's {@link HttpClient} port, and the facade's
 * implementation: runs the retry loop, validates responses and returns a Result.
 * Interceptors (installed by the factory) handle per-attempt concerns.
 */
export class AxiosHttpClient extends BaseHttpClient {
  constructor(
    private readonly axios: AxiosInstance,
    private readonly options: AxiosHttpClientOptions,
  ) {
    super();
  }

  async request<T = unknown>(config: RequestConfig<T>): Promise<ApiResult<T>> {
    const { method, path, body, query, headers, signal, timeoutMs } = config;
    const { clock, logger, idGenerator } = this.options;
    const retry = config.retry ?? this.options.retry;
    const sleep = this.options.sleep ?? defaultSleep;
    const requestId = idGenerator();
    const startedAt = clock.now();
    const context = { method, url: path, requestId };

    for (let attempt = 1; ; attempt++) {
      let response: AxiosResponse<unknown>;
      try {
        response = await this.axios.request<unknown>({
          method,
          url: path,
          params: query,
          data: body,
          headers: headers ? { ...headers } : undefined,
          signal,
          timeout: timeoutMs,
          metadata: { requestId, attempt },
        });
      } catch (cause) {
        const error = normalizeHttpError(cause, context, () => clock.now());
        const delayMs = error.kind === 'cancelled' ? null : retry.getDelayMs({ attempt, error, method });
        if (delayMs === null) return err(error);

        logger.info('Retrying request', { ...context, attempt, delayMs, reason: error.kind });
        const completed = await sleep(delayMs, signal);
        if (!completed) return err(new ApiError('cancelled', 'Request was cancelled', context));
        continue;
      }

      let data: unknown = response.data;
      if (config.schema) {
        const parsed = config.schema.safeParse(data);
        if (!parsed.success) {
          logger.warn('HTTP response failed validation', {
            ...context,
            status: response.status,
            issues: parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join('.')}: ${issue.message}`),
          });
          return err(
            new ApiError('parse', `Unexpected response from ${method} ${path}`, {
              ...context,
              status: response.status,
              cause: parsed.error,
            }),
          );
        }
        data = parsed.data;
      }

      return ok({
        // Validated by `schema` when given; otherwise the caller chose `T` (default `unknown`).
        data: data as T,
        status: response.status,
        headers: toHeaderRecord(response.headers),
        requestId,
        durationMs: clock.now() - startedAt,
        attempts: attempt,
      });
    }
  }
}
