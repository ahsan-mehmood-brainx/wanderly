import { type AxiosAdapter, create as createAxiosInstance } from 'axios';

import { type Logger } from '@/core/logging/Logger';
import { type ConnectivityService } from '@/core/network/ConnectivityService';
import { type Clock } from '@/core/utils/Clock';
import { type IdGenerator } from '@/core/utils/IdGenerator';

import { AxiosHttpClient } from './AxiosHttpClient';
import { type HttpClient } from './HttpClient';
import { installInterceptors } from './interceptors';
import { type AuthStrategy, noAuth } from './strategies/AuthStrategy';
import { type RetryStrategy } from './strategies/RetryStrategy';

/** Everything that differs between the public APIs the app talks to. Declared by the feature that owns the API. */
export interface ApiDefinition {
  /** Short name used in logs, e.g. `open-meteo`. */
  readonly name: string;
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly auth?: AuthStrategy;
  readonly retry?: RetryStrategy;
  /** See `InterceptorDependencies.sendRequestId`. */
  readonly sendRequestId?: boolean;
}

/**
 * Factory for configured HTTP clients, one per API. Features ask for a client by
 * describing their API; they never construct axios instances or wire interceptors.
 */
export interface HttpClientFactory {
  create(api: ApiDefinition): HttpClient;
}

export interface AxiosHttpClientFactoryDependencies {
  readonly logger: Logger;
  readonly connectivity: Pick<ConnectivityService, 'isOffline'>;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  /** Current UI language for `Accept-Language`. */
  readonly getLanguage: () => string;
  readonly defaults: { readonly timeoutMs: number; readonly retry: RetryStrategy };
  /** Replaces the network transport. Tests use it so no real request is ever made. */
  readonly adapter?: AxiosAdapter;
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<boolean>;
}

export class AxiosHttpClientFactory implements HttpClientFactory {
  constructor(private readonly deps: AxiosHttpClientFactoryDependencies) {}

  create(api: ApiDefinition): HttpClient {
    const { defaults, adapter, clock, connectivity, getLanguage, idGenerator, sleep } = this.deps;
    const logger = this.deps.logger.child({ scope: 'http', api: api.name });

    const instance = createAxiosInstance({
      baseURL: api.baseUrl,
      timeout: api.timeoutMs ?? defaults.timeoutMs,
      headers: { Accept: 'application/json', ...api.headers },
      adapter,
      // Report timeouts as ETIMEDOUT rather than the ambiguous ECONNABORTED.
      transitional: { clarifyTimeoutError: true },
    });

    installInterceptors(instance, {
      logger,
      connectivity,
      clock,
      getLanguage,
      auth: api.auth ?? noAuth,
      sendRequestId: api.sendRequestId ?? false,
    });

    return new AxiosHttpClient(instance, { retry: api.retry ?? defaults.retry, idGenerator, clock, logger, sleep });
  }
}
