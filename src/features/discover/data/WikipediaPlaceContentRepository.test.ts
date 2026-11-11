import { AxiosHttpClientFactory, noRetry } from '@/core/http';
import { httpFailure, summaryDto } from '@/testing/discoverFixtures';
import { FakeConnectivityService } from '@/testing/FakeConnectivityService';
import { apiSuccess, FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { ManualClock, sequentialIds } from '@/testing/ManualClock';
import { createMockAxiosAdapter } from '@/testing/mockAxiosAdapter';
import { createTestLogger } from '@/testing/testDependencies';

import { WIKIPEDIA_API } from './apis';
import { toHttpsUrl, wikipediaTitleFromUrl } from './mappers';
import { SEARCH_PATH, summaryPath, WikipediaPlaceContentRepository } from './WikipediaPlaceContentRepository';

function setup() {
  const factory = new FakeHttpClientFactory();
  const repository = new WikipediaPlaceContentRepository(factory.create(WIKIPEDIA_API));
  return { repository, http: factory.client('wikipedia') };
}

describe('WikipediaPlaceContentRepository', () => {
  it('maps a page summary', async () => {
    const { repository, http } = setup();
    http.on('GET', summaryPath('Kyoto'), apiSuccess(summaryDto('Kyoto', { coordinates: { lat: 35, lon: 135.7 } })));

    const result = await repository.getSummary('Kyoto');

    expect(result).toEqual({
      ok: true,
      value: {
        title: 'Kyoto',
        description: 'City in Kyotoland',
        extract: 'Kyoto is a lovely place.',
        thumbnailUrl: 'https://upload.wikimedia.org/Kyoto-320.jpg',
        imageUrl: 'https://upload.wikimedia.org/Kyoto.jpg',
        articleUrl: 'https://en.m.wikipedia.org/wiki/Kyoto',
        coordinates: { latitude: 35, longitude: 135.7 },
      },
    });
  });

  it('encodes titles for the URL path', () => {
    expect(summaryPath('Queenstown, New Zealand')).toBe('/api/rest_v1/page/summary/Queenstown%2C_New_Zealand');
    expect(summaryPath('AC/DC')).toBe('/api/rest_v1/page/summary/AC%2FDC');
    expect(summaryPath('Hạ Long Bay')).toBe('/api/rest_v1/page/summary/H%E1%BA%A1_Long_Bay');
  });

  it('treats a missing article or a disambiguation page as "no description"', async () => {
    const { repository, http } = setup();
    http.on('GET', summaryPath('Nowhere'), httpFailure('notFound', 404));
    http.on('GET', summaryPath('Georgia'), apiSuccess(summaryDto('Georgia', { type: 'disambiguation' })));

    await expect(repository.getSummary('Nowhere')).resolves.toEqual({ ok: true, value: null });
    await expect(repository.getSummary('Georgia')).resolves.toEqual({ ok: true, value: null });
  });

  it('handles missing images and descriptions', async () => {
    const { repository, http } = setup();
    http.on(
      'GET',
      summaryPath('Bare'),
      apiSuccess({ type: 'standard', title: 'Bare', thumbnail: null, description: '', content_urls: 7 }),
    );

    const result = await repository.getSummary('Bare');

    expect(result.ok && result.value).toMatchObject({
      description: null,
      extract: null,
      thumbnailUrl: null,
      imageUrl: null,
      articleUrl: null,
    });
  });

  it('uses the thumbnail for headers when the original image is huge', async () => {
    const { repository, http } = setup();
    http.on(
      'GET',
      summaryPath('Big'),
      apiSuccess(
        summaryDto('Big', { originalimage: { source: 'https://upload.wikimedia.org/huge.tif', width: 9000 } }),
      ),
    );
    const result = await repository.getSummary('Big');
    expect(result.ok && result.value?.imageUrl).toBe('https://upload.wikimedia.org/Big-320.jpg');
  });

  it('reports invalid responses, rate limits and server errors', async () => {
    const { repository, http } = setup();
    http.on('GET', summaryPath('Weird'), apiSuccess({ unexpected: true }));
    http.on('GET', summaryPath('Busy'), httpFailure('rateLimited', 429));

    expect(await repository.getSummary('Weird')).toMatchObject({ ok: false, error: { kind: 'parse' } });
    expect(await repository.getSummary('Busy')).toMatchObject({ ok: false, error: { kind: 'rateLimited' } });
  });

  it('searches titles without retries, upgrading protocol-relative thumbnails', async () => {
    const { repository, http } = setup();
    http.on(
      'GET',
      SEARCH_PATH,
      apiSuccess({
        pages: [
          { title: 'Kyoto', description: 'City in Japan', thumbnail: { url: '//upload.wikimedia.org/k.jpg' } },
          { title: 'Kyoto Protocol', description: null, thumbnail: null },
        ],
      }),
    );

    const result = await repository.searchTitles('kyo', 5);

    expect(result).toEqual({
      ok: true,
      value: [
        { title: 'Kyoto', description: 'City in Japan', thumbnailUrl: 'https://upload.wikimedia.org/k.jpg' },
        { title: 'Kyoto Protocol', description: null, thumbnailUrl: null },
      ],
    });
    expect(http.requests[0]).toMatchObject({ query: { q: 'kyo', limit: 5 }, retry: noRetry });
  });

  it('identifies itself with Api-User-Agent (real HTTP stack)', async () => {
    const { adapter, requests } = createMockAxiosAdapter({ status: 200, data: summaryDto('Lisbon') });
    const factory = new AxiosHttpClientFactory({
      logger: createTestLogger(),
      connectivity: new FakeConnectivityService(),
      clock: new ManualClock(),
      idGenerator: sequentialIds(),
      getLanguage: () => 'en',
      defaults: { timeoutMs: 1_000, retry: noRetry },
      adapter,
    });

    await new WikipediaPlaceContentRepository(factory.create(WIKIPEDIA_API)).getSummary('Lisbon');

    expect(requests[0]?.baseURL).toBe('https://en.wikipedia.org');
    expect(requests[0]?.headers.get('Api-User-Agent')).toMatch(/^Wanderly\//);
  });
});

describe('mapper helpers', () => {
  it('only lets https URLs through', () => {
    expect(toHttpsUrl('//upload.wikimedia.org/a.jpg')).toBe('https://upload.wikimedia.org/a.jpg');
    expect(toHttpsUrl('http://example.com/a.jpg')).toBeNull();
    expect(toHttpsUrl('javascript:alert(1)')).toBeNull();
    expect(toHttpsUrl(null)).toBeNull();
  });

  it('reads English Wikipedia article titles from links', () => {
    expect(wikipediaTitleFromUrl('https://en.wikipedia.org/wiki/Georgia_(country)')).toBe('Georgia (country)');
    expect(wikipediaTitleFromUrl('https://en.wikipedia.org/wiki/S%C3%A3o_Tom%C3%A9')).toBe('São Tomé');
    expect(wikipediaTitleFromUrl('https://fr.wikipedia.org/wiki/Paris')).toBeNull();
    expect(wikipediaTitleFromUrl('https://en.wikipedia.org/wiki/%E0%A4%A')).toBeNull();
  });
});
