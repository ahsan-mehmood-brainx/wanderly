import { type AxiosInstance, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

import { shouldReportError } from '@/core/errors/errorMessages';
import { type Logger } from '@/core/logging/Logger';
import { type ConnectivityService } from '@/core/network/ConnectivityService';
import { type Clock } from '@/core/utils/Clock';

import { ApiError } from './ApiError';
import { type HttpMethod } from './HttpClient';
import { normalizeHttpError } from './normalizeHttpError';
import { type AuthStrategy } from './strategies/AuthStrategy';

export interface RequestMetadata {
  readonly requestId?: string;
  readonly attempt?: number;
  readonly startedAt?: number;
}

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Wanderly bookkeeping carried from the client through the interceptors. */
    metadata?: RequestMetadata;
  }
}

export const REQUEST_ID_HEADER = 'X-Request-Id';

export interface InterceptorDependencies {
  readonly logger: Logger;
  readonly connectivity: Pick<ConnectivityService, 'isOffline'>;
  readonly clock: Clock;
  readonly getLanguage: () => string;
  readonly auth: AuthStrategy;
  /**
   * Adds `X-Request-Id`. Off by default: on web, a non-safelisted header triggers a
   * CORS preflight that most public APIs reject. Enable only for APIs that allow it.
   */
  readonly sendRequestId: boolean;
}

type RequestInterceptor = (
  config: InternalAxiosRequestConfig,
) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>;

const requestContext = (config: InternalAxiosRequestConfig) => ({
  method: (config.method?.toUpperCase() ?? 'GET') as HttpMethod,
  url: config.url,
  requestId: config.metadata?.requestId,
  attempt: config.metadata?.attempt,
});

/** Fails fast when the device is offline instead of waiting for a timeout. */
export const offlineGuard =
  (connectivity: Pick<ConnectivityService, 'isOffline'>): RequestInterceptor =>
  (config) => {
    if (connectivity.isOffline()) throw new ApiError('offline', 'Device is offline', requestContext(config));
    return config;
  };

/** Records the attempt's start time (for duration logs) and optionally the correlation header. */
export const stampRequest =
  (clock: Clock, sendRequestId: boolean): RequestInterceptor =>
  (config) => {
    config.metadata = { ...config.metadata, startedAt: clock.now() };
    const requestId = config.metadata.requestId;
    if (sendRequestId && requestId && !config.headers.has(REQUEST_ID_HEADER)) {
      config.headers.set(REQUEST_ID_HEADER, requestId);
    }
    return config;
  };

/** Sends the app's current language (read per request) so APIs that localise return matching content. */
export const languageHeader =
  (getLanguage: () => string): RequestInterceptor =>
  (config) => {
    if (!config.headers.has('Accept-Language')) config.headers.set('Accept-Language', getLanguage());
    return config;
  };

/** Applies the API's auth strategy. Explicit per-request headers win over strategy headers. */
export const authorize =
  (auth: AuthStrategy): RequestInterceptor =>
  async (config) => {
    const credentials = await auth.getCredentials();
    for (const [name, value] of Object.entries(credentials.headers ?? {})) {
      if (!config.headers.has(name)) config.headers.set(name, value);
    }
    if (credentials.query) config.params = { ...config.params, ...credentials.query };
    return config;
  };

/**
 * Wires the cross-cutting request/response behaviour onto an axios instance.
 *
 * Request interceptors run in this order: offline guard → stamp → language → auth.
 * (Axios runs request interceptors last-registered-first, hence the reversed registration.)
 *
 * The response interceptor logs every attempt and converts every failure into an
 * {@link ApiError}, so nothing downstream ever sees an axios error.
 */
export function installInterceptors(instance: AxiosInstance, deps: InterceptorDependencies): void {
  const requestPipeline: RequestInterceptor[] = [
    offlineGuard(deps.connectivity),
    stampRequest(deps.clock, deps.sendRequestId),
    languageHeader(deps.getLanguage),
    authorize(deps.auth),
  ];
  for (const interceptor of [...requestPipeline].reverse()) instance.interceptors.request.use(interceptor);

  const durationMs = (config: InternalAxiosRequestConfig | undefined) => {
    const startedAt = config?.metadata?.startedAt;
    return startedAt === undefined ? undefined : deps.clock.now() - startedAt;
  };

  instance.interceptors.response.use(
    (response: AxiosResponse) => {
      deps.logger.debug('HTTP response', {
        ...requestContext(response.config),
        status: response.status,
        durationMs: durationMs(response.config),
      });
      return response;
    },
    (error: unknown) => {
      const apiError = normalizeHttpError(error, {}, () => deps.clock.now());
      const config = (error as { config?: InternalAxiosRequestConfig } | null)?.config;
      const context = {
        ...apiError.toLogContext(),
        attempt: config?.metadata?.attempt,
        durationMs: durationMs(config),
      };
      if (shouldReportError(apiError.kind)) deps.logger.warn('HTTP request failed', context);
      else deps.logger.debug('HTTP request cancelled', context);
      return Promise.reject(apiError);
    },
  );
}
