import { type Clock } from '@/core/utils/Clock';
import { FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { stubNominatim, stubOverpass } from '@/testing/mapFixtures';

import { SearchPlaces } from '../domain/usecases/SearchPlaces';
import { NominatimGeocodingService } from './NominatimGeocodingService';
import { NOMINATIM_API, OVERPASS_API } from './osmApis';
import { OsmPlacesRepository } from './OsmPlacesRepository';
import { OverpassPlacesApiService } from './OverpassPlacesApiService';

const fakeTimeClock: Clock = { now: () => Date.now() };

function setup() {
  const factory = new FakeHttpClientFactory();
  stubOverpass(factory);
  const nominatim = stubNominatim(factory);
  const repository = new OsmPlacesRepository(
    new NominatimGeocodingService(factory.create(NOMINATIM_API), fakeTimeClock),
    new OverpassPlacesApiService(factory.create(OVERPASS_API), fakeTimeClock),
    fakeTimeClock,
  );
  return { nominatim, searchPlaces: new SearchPlaces(repository) };
}

async function settle<T>(promise: Promise<T>): Promise<T> {
  await jest.advanceTimersByTimeAsync(2_000);
  return promise;
}

describe('place search language', () => {
  beforeEach(() => jest.useFakeTimers({ now: 1_000_000 }));
  afterEach(() => jest.useRealTimers());

  it('searches again, in the new language, after the app language changes', async () => {
    const { nominatim, searchPlaces } = setup();

    await settle(searchPlaces.execute({ query: 'Louvre', language: 'en' }));
    await settle(searchPlaces.execute({ query: 'louvre', language: 'en' }));
    await settle(searchPlaces.execute({ query: 'Louvre', language: 'es' }));

    expect(nominatim.requests).toHaveLength(2);
    expect(nominatim.requests[0]?.headers).toEqual({ 'Accept-Language': 'en' });
    expect(nominatim.requests[1]?.headers).toEqual({ 'Accept-Language': 'es' });
  });

  it('leaves Accept-Language to the shared interceptor when no language is given', async () => {
    const { nominatim, searchPlaces } = setup();

    await settle(searchPlaces.execute({ query: 'Louvre' }));

    expect(nominatim.requests[0]?.headers).toBeUndefined();
  });
});
