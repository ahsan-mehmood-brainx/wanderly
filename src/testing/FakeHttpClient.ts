import { ApiError } from '@/core/http/ApiError';
import {
  type ApiResponse,
  type ApiResult,
  BaseHttpClient,
  type HttpMethod,
  type RequestConfig,
} from '@/core/http/HttpClient';
import { type ApiDefinition, type HttpClientFactory } from '@/core/http/HttpClientFactory';
import { err, ok } from '@/core/result';

type Responder = ApiResult<unknown> | ((request: RequestConfig<unknown>) => ApiResult<unknown>);

/** Builds a successful {@link ApiResult} with sensible defaults. */
export function apiSuccess<T>(data: T, overrides: Partial<Omit<ApiResponse<T>, 'data'>> = {}): ApiResult<T> {
  return ok({ data, status: 200, headers: {}, requestId: 'fake-request', durationMs: 0, attempts: 1, ...overrides });
}

export function apiFailure(error: ApiError): ApiResult<never> {
  return err(error);
}

/**
 * In-memory HttpClient for testing repositories and use cases without any network.
 *
 * - Stub responses per `METHOD path`; unstubbed requests fail with `notFound`.
 * - Applies the request's `schema` exactly like the real client, so a DTO that
 *   doesn't match the stubbed payload fails the test with a `parse` error.
 * - Honours an already-aborted `signal` with a `cancelled` error.
 * - Records every request for assertions.
 */
export class FakeHttpClient extends BaseHttpClient {
  readonly requests: RequestConfig<unknown>[] = [];
  private readonly responders = new Map<string, Responder>();

  on(method: HttpMethod, path: string, responder: Responder): this {
    this.responders.set(`${method} ${path}`, responder);
    return this;
  }

  async request<T = unknown>(config: RequestConfig<T>): Promise<ApiResult<T>> {
    const request = config as RequestConfig<unknown>;
    this.requests.push(request);
    const context = { method: config.method, url: config.path, requestId: 'fake-request' };

    if (config.signal?.aborted) return err(new ApiError('cancelled', 'Request was cancelled', context));

    const responder = this.responders.get(`${config.method} ${config.path}`);
    if (!responder)
      return err(new ApiError('notFound', `No fake response for ${config.method} ${config.path}`, context));

    const result = typeof responder === 'function' ? responder(request) : responder;
    if (!result.ok || !config.schema) return result as ApiResult<T>;

    const parsed = config.schema.safeParse(result.value.data);
    if (!parsed.success) {
      return err(
        new ApiError('parse', `Unexpected response from ${config.method} ${config.path}`, {
          ...context,
          cause: parsed.error,
        }),
      );
    }
    return ok({ ...result.value, data: parsed.data });
  }
}

/** Hands out one {@link FakeHttpClient} per API name; stub it via `factory.client('my-api')`. */
export class FakeHttpClientFactory implements HttpClientFactory {
  private readonly clients = new Map<string, FakeHttpClient>();
  readonly created: ApiDefinition[] = [];

  create(api: ApiDefinition): FakeHttpClient {
    this.created.push(api);
    return this.client(api.name);
  }

  client(apiName: string): FakeHttpClient {
    let client = this.clients.get(apiName);
    if (!client) {
      client = new FakeHttpClient();
      this.clients.set(apiName, client);
    }
    return client;
  }
}
