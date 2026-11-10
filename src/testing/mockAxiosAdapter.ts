import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

export type MockReply =
  | { readonly status: number; readonly data?: unknown; readonly headers?: Record<string, string> }
  | { readonly networkError: true }
  | { readonly timeout: true }
  | { readonly hang: true };

/**
 * Axios transport stub: lets tests drive the real AxiosHttpClient (interceptors,
 * retries, error mapping) with scripted replies instead of real network requests.
 * Replies are consumed in order; the last one repeats. Honours abort signals.
 */
export function createMockAxiosAdapter(...replies: MockReply[]) {
  const requests: InternalAxiosRequestConfig[] = [];
  let index = 0;

  const adapter: AxiosAdapter = (config) => {
    requests.push(config);
    const reply = replies[Math.min(index++, replies.length - 1)];
    if (!reply) throw new Error('createMockAxiosAdapter needs at least one reply');

    if ('networkError' in reply) return Promise.reject(new AxiosError('Network Error', AxiosError.ERR_NETWORK, config));
    if ('timeout' in reply) {
      return Promise.reject(new AxiosError(`timeout of ${config.timeout}ms exceeded`, AxiosError.ETIMEDOUT, config));
    }
    if ('hang' in reply) {
      return new Promise((_, reject) => {
        config.signal?.addEventListener?.('abort', () =>
          reject(new AxiosError('canceled', AxiosError.ERR_CANCELED, config)),
        );
      });
    }

    const response: AxiosResponse = {
      data: reply.data,
      status: reply.status,
      statusText: String(reply.status),
      headers: reply.headers ?? {},
      config,
    };
    // Mirror axios' default `validateStatus`: non-2xx rejects with the response attached.
    if (reply.status >= 200 && reply.status < 300) return Promise.resolve(response);
    return Promise.reject(
      new AxiosError(
        `Request failed with status code ${reply.status}`,
        AxiosError.ERR_BAD_RESPONSE,
        config,
        null,
        response,
      ),
    );
  };

  return { adapter, requests };
}
