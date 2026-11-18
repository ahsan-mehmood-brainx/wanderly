import { AxiosHttpClientFactory, ExponentialBackoffRetry } from '@/core/http';
import { countryDto, countryPage, httpFailure, WORLD_DTOS } from '@/testing/discoverFixtures';
import { FakeConnectivityService } from '@/testing/FakeConnectivityService';
import { apiSuccess, FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { ManualClock, sequentialIds } from '@/testing/ManualClock';
import { createMockAxiosAdapter, type MockReply } from '@/testing/mockAxiosAdapter';
import { createTestLogger } from '@/testing/testDependencies';

import { CATALOGUE_FIELDS, DETAIL_FIELDS, REST_COUNTRIES_PAGE_SIZE, restCountriesApi } from './apis';
import { RestCountriesRepository } from './RestCountriesRepository';

function setup(apiKey: string | null = 'key-123') {
  const factory = new FakeHttpClientFactory();
  const logger = createTestLogger();
  const repository = new RestCountriesRepository({ http: factory.create(restCountriesApi(apiKey)), apiKey, logger });
  return { repository, http: factory.client('restcountries'), logger };
}

const manyCountries = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, index) => {
    const n = index + offset;
    const code = `${String.fromCharCode(65 + Math.floor(n / 26))}${String.fromCharCode(65 + (n % 26))}`;
    return countryDto(code, `Country ${code}`);
  });

describe('RestCountriesRepository (fake HTTP)', () => {
  it('maps v5 objects to countries, normalising codes and tolerating missing fields', async () => {
    const { repository, http } = setup();
    http.on(
      'GET',
      '',
      apiSuccess(
        countryPage([
          WORLD_DTOS[0],
          // A territory with almost nothing: still a valid country.
          { names: { common: 'Bouvet Island' }, codes: { alpha_2: 'bv' }, capitals: [], currencies: null },
          // Malformed fields fall back individually instead of dropping the country.
          countryDto('XK', 'Kosovo', { population: 'lots', flag: { url_png: 'http://insecure/xk.png' }, cars: 7 }),
        ]),
      ),
    );

    const result = await repository.getAll();

    if (!result.ok) throw result.error;
    expect(result.value.map((country) => country.code)).toEqual(['PT', 'BV', 'XK']);
    expect(result.value[0]).toMatchObject({
      name: 'Portugal',
      code3: 'PRT',
      capitals: ['Lisbon'],
      currencies: [{ code: 'EUR', name: 'Euro', symbol: '€' }],
      callingCodes: ['351'],
      wikipediaTitle: 'Portugal',
    });
    expect(result.value[1]).toMatchObject({
      capitals: [],
      region: null,
      population: null,
      currencies: [],
      languages: [],
      flag: { pngUrl: null, emoji: null },
      wikipediaTitle: null,
    });
    // Unparseable population and driving side become "unknown"; a non-https flag URL is dropped.
    expect(result.value[2]).toMatchObject({ population: null, drivingSide: null, flag: { pngUrl: null } });
  });

  it('requests a projected page and passes the cancellation signal', async () => {
    const { repository, http } = setup();
    http.on('GET', '', apiSuccess(countryPage(WORLD_DTOS)));
    const controller = new AbortController();

    await repository.getAll(controller.signal);

    expect(http.requests[0]?.query).toEqual({ limit: 100, offset: 0, response_fields: CATALOGUE_FIELDS });
    expect(http.requests[0]?.signal).toBe(controller.signal);
  });

  it('pages through the whole catalogue (free plans cap pages at 100)', async () => {
    const { repository, http } = setup();
    const pages = [manyCountries(100), manyCountries(100, 100), manyCountries(50, 200)];
    http.otherwise((request) => {
      const page = Number(request.query?.offset) / REST_COUNTRIES_PAGE_SIZE;
      return apiSuccess(countryPage(pages[page] ?? [], { more: page < 2 }));
    });

    const result = await repository.getAll();

    expect(result.ok && result.value).toHaveLength(250);
    expect(http.requests.map((request) => request.query?.offset)).toEqual([0, 100, 200]);
  });

  it('skips a malformed country and logs it, without failing the list', async () => {
    const { repository, http, logger } = setup();
    http.on('GET', '', apiSuccess(countryPage([WORLD_DTOS[0], { names: {} }, 'garbage'])));

    const result = await repository.getAll();

    expect(result.ok && result.value.map((country) => country.name)).toEqual(['Portugal']);
    expect(logger.warn).toHaveBeenCalledWith('Skipped malformed countries', { skipped: 2, received: 3 });
  });

  it('fails with parse when nothing in the response is readable', async () => {
    const { repository, http } = setup();
    http.on('GET', '', apiSuccess(countryPage([{ nope: true }])));
    const result = await repository.getAll();
    expect(!result.ok && result.error.kind).toBe('parse');
  });

  it('rejects the retired v3.1 answer (HTTP 200 with an error body) as a parse error', async () => {
    const { repository, http } = setup();
    http.on(
      'GET',
      '',
      apiSuccess({ success: false, data: null, errors: [{ message: 'This API version has been deprecated.' }] }),
    );
    const result = await repository.getAll();
    expect(!result.ok && result.error.kind).toBe('parse');
  });

  it('rejects demo-key sample data instead of showing it as real data', async () => {
    const { repository, http } = setup();
    http.on('GET', '', apiSuccess({ data: { objects: [WORLD_DTOS[0]], _demo: { message: 'demo' } } }));
    const result = await repository.getAll();
    expect(!result.ok && result.error.kind).toBe('configuration');
  });

  it('fails with configuration, without a request, when the build has no API key', async () => {
    const { repository, http } = setup(null);
    expect(await repository.getAll()).toMatchObject({ ok: false, error: { kind: 'configuration' } });
    expect(await repository.getByCode('PT')).toMatchObject({ ok: false, error: { kind: 'configuration' } });
    expect(http.requests).toHaveLength(0);
  });

  it('maps a rejected key to configuration and passes other failures through', async () => {
    const { repository, http } = setup();
    http.on('GET', '', httpFailure('unauthorized', 401));
    expect(await repository.getAll()).toMatchObject({ ok: false, error: { kind: 'configuration' } });

    http.on('GET', '', httpFailure('rateLimited', 429));
    expect(await repository.getAll()).toMatchObject({ ok: false, error: { kind: 'rateLimited' } });
  });

  it('gets one country with every detail field', async () => {
    const { repository, http } = setup();
    http.on('GET', '/codes.alpha_2/PT', apiSuccess(countryPage([WORLD_DTOS[0]])));

    const result = await repository.getByCode(' pt ');

    expect(result.ok && result.value.name).toBe('Portugal');
    expect(http.requests[0]?.query).toEqual({ response_fields: DETAIL_FIELDS });
  });

  it('reports an unknown or malformed code as notFound', async () => {
    const { repository, http } = setup();
    http.on('GET', '/codes.alpha_2/ZZ', apiSuccess(countryPage([])));

    expect(await repository.getByCode('ZZ')).toMatchObject({ ok: false, error: { kind: 'notFound' } });
    expect(await repository.getByCode('../all')).toMatchObject({ ok: false, error: { kind: 'notFound' } });
    expect(http.requests).toHaveLength(1);
  });
});

describe('RestCountriesRepository (real HTTP stack)', () => {
  function realSetup(replies: MockReply[], apiKey = 'key-123') {
    const { adapter, requests } = createMockAxiosAdapter(...replies);
    const sleep = jest.fn((_ms: number) => Promise.resolve(true));
    const factory = new AxiosHttpClientFactory({
      logger: createTestLogger(),
      connectivity: new FakeConnectivityService(),
      clock: new ManualClock(),
      idGenerator: sequentialIds(),
      getLanguage: () => 'en',
      defaults: { timeoutMs: 1_000, retry: new ExponentialBackoffRetry({ maxRetries: 2, random: () => 0 }) },
      adapter,
      sleep,
    });
    const repository = new RestCountriesRepository({
      http: factory.create(restCountriesApi(apiKey)),
      apiKey,
      logger: createTestLogger(),
    });
    return { repository, requests, sleep };
  }

  it('sends the API key as a bearer token to the v5 endpoint', async () => {
    const { repository, requests } = realSetup([{ status: 200, data: countryPage([WORLD_DTOS[0]]) }]);

    await repository.getByCode('PT');

    expect(requests[0]?.baseURL).toBe('https://api.restcountries.com/countries/v5');
    expect(requests[0]?.url).toBe('/codes.alpha_2/PT');
    expect(requests[0]?.headers.get('Authorization')).toBe('Bearer key-123');
  });

  it('waits out a short Retry-After on 429, then succeeds', async () => {
    const { repository, requests, sleep } = realSetup([
      { status: 429, headers: { 'Retry-After': '2' } },
      { status: 200, data: countryPage([WORLD_DTOS[0]]) },
    ]);

    const result = await repository.getByCode('PT');

    expect(result.ok).toBe(true);
    expect(requests).toHaveLength(2);
    expect(sleep).toHaveBeenCalledWith(2_000, undefined);
  });

  it('gives up with rateLimited when the server asks for a long wait', async () => {
    const { repository, requests } = realSetup([{ status: 429, headers: { 'Retry-After': '60' } }]);

    const result = await repository.getAll();

    expect(!result.ok && result.error.kind).toBe('rateLimited');
    expect(requests).toHaveLength(1);
  });

  it('never retries a rejected key', async () => {
    const { repository, requests } = realSetup([{ status: 401, data: { errors: [{ message: 'bad key' }] } }]);
    const result = await repository.getAll();
    expect(!result.ok && result.error.kind).toBe('configuration');
    expect(requests).toHaveLength(1);
  });
});
