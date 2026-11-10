import { z } from 'zod';

import { FakeConnectivityService, OFFLINE } from '@/testing/FakeConnectivityService';
import { ManualClock, sequentialIds } from '@/testing/ManualClock';
import { createMockAxiosAdapter, type MockReply } from '@/testing/mockAxiosAdapter';
import { createTestLogger } from '@/testing/testDependencies';

import { type ApiDefinition, AxiosHttpClientFactory } from './HttpClientFactory';
import { REQUEST_ID_HEADER } from './interceptors';
import { ApiKeyAuth, BearerTokenAuth } from './strategies/AuthStrategy';
import { ExponentialBackoffRetry, noRetry } from './strategies/RetryStrategy';

const placeSchema = z.object({ id: z.string(), name: z.string() });

function setup(replies: MockReply[], api: Partial<ApiDefinition> = {}) {
  const { adapter, requests } = createMockAxiosAdapter(...replies);
  const connectivity = new FakeConnectivityService();
  const logger = createTestLogger();
  const sleep = jest.fn((_ms: number, signal?: AbortSignal) => Promise.resolve(!signal?.aborted));
  const factory = new AxiosHttpClientFactory({
    logger,
    connectivity,
    clock: new ManualClock(),
    idGenerator: sequentialIds('req'),
    getLanguage: () => 'es',
    defaults: { timeoutMs: 5_000, retry: new ExponentialBackoffRetry({ maxRetries: 2, random: () => 0 }) },
    adapter,
    sleep,
  });
  const client = factory.create({ name: 'test-api', baseUrl: 'https://api.example.com/v1', ...api });
  return { client, requests, connectivity, logger, sleep };
}

describe('AxiosHttpClient (through AxiosHttpClientFactory)', () => {
  describe('successful requests', () => {
    it('returns the standard response envelope with validated data', async () => {
      const { client } = setup([{ status: 200, data: { id: '1', name: 'Lisbon' }, headers: { 'X-Total': '1' } }]);

      const result = await client.get('/places/1', { schema: placeSchema });

      expect(result).toEqual({
        ok: true,
        value: {
          data: { id: '1', name: 'Lisbon' },
          status: 200,
          headers: { 'x-total': '1' },
          requestId: 'req-1',
          durationMs: 0,
          attempts: 1,
        },
      });
    });

    it('sends method, base URL, path, query, body, timeout and default headers', async () => {
      const { client, requests } = setup([{ status: 201, data: {} }]);

      await client.post('/trips', { name: 'Japan' }, { query: { draft: true, skip: undefined }, timeoutMs: 1_000 });

      const [request] = requests;
      expect(request?.method).toBe('post');
      expect(request?.baseURL).toBe('https://api.example.com/v1');
      expect(request?.url).toBe('/trips');
      expect(request?.params).toEqual({ draft: true, skip: undefined });
      expect(request?.timeout).toBe(1_000);
      expect(request?.headers.get('Accept')).toBe('application/json');
      expect(request?.headers.get('Accept-Language')).toBe('es');
    });

    it('uses the API default timeout when the request has none', async () => {
      const { client, requests } = setup([{ status: 200 }], { timeoutMs: 2_500 });
      await client.get('/x');
      expect(requests[0]?.timeout).toBe(2_500);
    });

    it('does not send a request-id header unless the API opts in (avoids CORS preflights on web)', async () => {
      const off = setup([{ status: 200 }]);
      await off.client.get('/x');
      expect(off.requests[0]?.headers.has(REQUEST_ID_HEADER)).toBe(false);

      const on = setup([{ status: 200 }], { sendRequestId: true });
      await on.client.get('/x');
      expect(on.requests[0]?.headers.get(REQUEST_ID_HEADER)).toBe('req-1');
    });
  });

  describe('auth strategies', () => {
    it('adds an API key to the query string', async () => {
      const { client, requests } = setup([{ status: 200 }], {
        auth: new ApiKeyAuth({ name: 'apikey', value: 'k-123', location: 'query' }),
      });
      await client.get('/x', { query: { q: 'rome' } });
      expect(requests[0]?.params).toEqual({ q: 'rome', apikey: 'k-123' });
    });

    it('adds a bearer token header, without overriding an explicit one', async () => {
      const auth = new BearerTokenAuth(() => Promise.resolve('t-1'));
      const { client, requests } = setup([{ status: 200 }], { auth });

      await client.get('/x');
      await client.get('/x', { headers: { Authorization: 'Custom c' } });

      expect(requests[0]?.headers.get('Authorization')).toBe('Bearer t-1');
      expect(requests[1]?.headers.get('Authorization')).toBe('Custom c');
    });
  });

  describe('centralised error handling', () => {
    it.each([
      [400, 'badRequest'],
      [401, 'unauthorized'],
      [403, 'forbidden'],
      [404, 'notFound'],
      [422, 'badRequest'],
      [500, 'server'],
    ] as const)('maps HTTP %i to %s', async (status, kind) => {
      const { client } = setup([{ status, data: { message: 'server says no' } }], { retry: noRetry });

      const result = await client.get('/x');

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatchObject({ kind, status, method: 'GET', url: '/x', requestId: 'req-1' });
      expect(result.error.serverMessage).toBe('server says no');
    });

    it('maps a timeout', async () => {
      const { client } = setup([{ timeout: true }], { retry: noRetry });
      const result = await client.get('/x');
      expect(!result.ok && result.error.kind).toBe('timeout');
    });

    it('maps a missing response to a network error', async () => {
      const { client } = setup([{ networkError: true }], { retry: noRetry });
      const result = await client.get('/x');
      expect(!result.ok && result.error.kind).toBe('network');
    });

    it('returns a parse error when the response does not match the schema', async () => {
      const { client, logger } = setup([{ status: 200, data: { id: 1 } }]);

      const result = await client.get('/places/1', { schema: placeSchema });

      expect(!result.ok && result.error).toMatchObject({ kind: 'parse', status: 200 });
      expect(logger.warn).toHaveBeenCalledWith('HTTP response failed validation', expect.anything());
    });

    it('logs failed attempts as warnings with request context', async () => {
      const { client, logger } = setup([{ status: 404 }]);
      await client.get('/missing');
      expect(logger.warn).toHaveBeenCalledWith(
        'HTTP request failed',
        expect.objectContaining({ kind: 'notFound', status: 404, url: '/missing', requestId: 'req-1', attempt: 1 }),
      );
    });

    it('never throws, even if the transport throws something unexpected', async () => {
      const { client } = setup([{ status: 200 }], { auth: { getCredentials: () => Promise.reject('weird') } });
      const result = await client.get('/x');
      expect(!result.ok && result.error.kind).toBe('unknown');
    });
  });

  describe('retries', () => {
    it('retries transient failures on idempotent requests, then succeeds', async () => {
      const { client, requests, sleep } = setup([{ status: 503 }, { networkError: true }, { status: 200, data: 'ok' }]);

      const result = await client.get('/x');

      expect(result.ok && result.value).toMatchObject({ data: 'ok', attempts: 3 });
      expect(requests).toHaveLength(3);
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([150, 300]);
      expect(requests.map((request) => request.metadata?.requestId)).toEqual(['req-1', 'req-1', 'req-1']);
    });

    it('gives up after the retry budget and returns the last error', async () => {
      const { client, requests } = setup([{ status: 502 }]);
      const result = await client.get('/x');
      expect(!result.ok && result.error.kind).toBe('server');
      expect(requests).toHaveLength(3);
    });

    it('never retries non-idempotent requests', async () => {
      const { client, requests } = setup([{ status: 503 }]);
      await client.post('/trips', {});
      expect(requests).toHaveLength(1);
    });

    it('does not retry client errors', async () => {
      const { client, requests } = setup([{ status: 404 }]);
      await client.get('/x');
      expect(requests).toHaveLength(1);
    });

    it('honours Retry-After on 429', async () => {
      const { client, sleep } = setup([{ status: 429, headers: { 'Retry-After': '2' } }, { status: 200 }]);
      await client.get('/x');
      expect(sleep).toHaveBeenCalledWith(2_000, undefined);
    });

    it('lets a request override the API retry strategy', async () => {
      const { client, requests } = setup([{ status: 503 }]);
      await client.get('/x', { retry: noRetry });
      expect(requests).toHaveLength(1);
    });
  });

  describe('connectivity', () => {
    it('fails fast while offline without touching the network', async () => {
      const { client, requests, connectivity } = setup([{ status: 200 }]);
      connectivity.set(OFFLINE);

      const result = await client.get('/x');

      expect(!result.ok && result.error.kind).toBe('offline');
      expect(requests).toHaveLength(0);
    });
  });

  describe('cancellation', () => {
    it('returns cancelled for an already-aborted signal, without retrying', async () => {
      const { client, requests, logger } = setup([{ status: 200 }]);
      const controller = new AbortController();
      controller.abort();

      const result = await client.get('/x', { signal: controller.signal });

      expect(!result.ok && result.error.kind).toBe('cancelled');
      expect(requests).toHaveLength(0);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('cancels an in-flight request', async () => {
      const { client } = setup([{ hang: true }]);
      const controller = new AbortController();

      const pending = client.get('/x', { signal: controller.signal });
      controller.abort();

      const result = await pending;
      expect(!result.ok && result.error.kind).toBe('cancelled');
    });

    it('cancels while waiting to retry', async () => {
      const { client, requests, sleep } = setup([{ status: 503 }, { status: 200 }]);
      const controller = new AbortController();
      sleep.mockImplementationOnce(() => {
        controller.abort();
        return Promise.resolve(false);
      });

      const result = await client.get('/x', { signal: controller.signal });

      expect(!result.ok && result.error.kind).toBe('cancelled');
      expect(requests).toHaveLength(1);
    });
  });
});
