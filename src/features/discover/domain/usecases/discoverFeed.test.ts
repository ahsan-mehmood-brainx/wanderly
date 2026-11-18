import { AppError } from '@/core/errors/AppError';
import { err } from '@/core/result';
import { FakeCountryRepository, FakePlaceContentRepository } from '@/testing/discoverFixtures';

import { type RecentDestination } from '../Destination';
import { countryDestinationId, placeDestinationId } from '../DestinationId';
import { FEATURED_SLUGS } from '../editorial';
import { GetCuratedCollection, GetPopularCountries, GetRecommendations } from './discoverFeed';

const recent = (id: string, name: string, countryCode: string | null): RecentDestination => ({
  id,
  kind: 'place',
  name,
  countryCode,
  countryName: null,
  imageUrl: null,
  flagEmoji: null,
  viewedAt: 0,
});

describe('GetCuratedCollection', () => {
  it('returns featured destinations with photos, descriptions and host countries', async () => {
    const content = new FakePlaceContentRepository();
    const useCase = new GetCuratedCollection(new FakeCountryRepository(), content);

    const result = await useCase.execute({ collection: 'featured' });

    expect(result.ok && result.value.map((destination) => destination.id)).toEqual(FEATURED_SLUGS);
    expect(result.ok && result.value[0]).toMatchObject({
      name: 'Kyoto',
      countryName: 'Japan',
      imageUrl: expect.stringContaining('Kyoto'),
      description: 'City in Kyotoland',
    });
  });

  it('degrades per card: a missing article, a failed request or an unknown country leaves gaps, not an error', async () => {
    const content = new FakePlaceContentRepository();
    content.summaries.set('Kyoto', null);
    content.summaryErrors.set('Santorini', new AppError('server', '503'));
    const useCase = new GetCuratedCollection(new FakeCountryRepository(), content);

    const result = await useCase.execute({ collection: 'featured' });

    if (!result.ok) throw result.error;
    expect(result.value[0]).toMatchObject({ name: 'Kyoto', imageUrl: null, description: null });
    // Santorini's country (GR) is not in the fixture catalogue either.
    expect(result.value[1]).toMatchObject({ name: 'Santorini', imageUrl: null, countryName: null });
  });

  it('fails, so the section can retry, when the catalogue fails transiently', async () => {
    const countries = new FakeCountryRepository();
    countries.allError = new AppError('offline', 'offline');
    const content = new FakePlaceContentRepository();
    const result = await new GetCuratedCollection(countries, content).execute({ collection: 'featured' });
    expect(!result.ok && result.error.kind).toBe('offline');
  });

  it('fails when every summary fails, instead of returning bare cards', async () => {
    const content = new FakePlaceContentRepository();
    jest.spyOn(content, 'getSummary').mockResolvedValue(err(new AppError('offline', 'offline')));
    const result = await new GetCuratedCollection(new FakeCountryRepository(), content).execute({
      collection: 'featured',
    });
    expect(!result.ok && result.error.kind).toBe('offline');
  });

  it('fails when both sources are offline', async () => {
    const countries = new FakeCountryRepository();
    countries.allError = new AppError('offline', 'offline');
    const content = new FakePlaceContentRepository();
    jest.spyOn(content, 'getSummary').mockResolvedValue(err(new AppError('offline', 'offline')));
    const result = await new GetCuratedCollection(countries, content).execute({ collection: 'featured' });
    expect(!result.ok && result.error.kind).toBe('offline');
  });

  it('still works without the country catalogue when it is not configured', async () => {
    const countries = new FakeCountryRepository();
    countries.allError = new AppError('configuration', 'no key');
    const result = await new GetCuratedCollection(countries, new FakePlaceContentRepository()).execute({
      collection: 'trending',
    });
    expect(result.ok && result.value).toHaveLength(8);
  });

  it('propagates cancellation', async () => {
    const content = new FakePlaceContentRepository();
    content.summaryErrors.set('Seoul', new AppError('cancelled', 'gone'));
    const result = await new GetCuratedCollection(new FakeCountryRepository(), content).execute({
      collection: 'trending',
    });
    expect(!result.ok && result.error.kind).toBe('cancelled');
  });
});

describe('GetPopularCountries', () => {
  it('lists the most-visited countries the API returned, in editorial order', async () => {
    const result = await new GetPopularCountries(new FakeCountryRepository()).execute();
    expect(result.ok && result.value.map((destination) => destination.name)).toEqual([
      'France',
      'Spain',
      'Mexico',
      'Japan',
      'Portugal',
    ]);
  });

  it('fails when the catalogue fails', async () => {
    const countries = new FakeCountryRepository();
    countries.allError = new AppError('rateLimited', '429');
    const result = await new GetPopularCountries(countries).execute();
    expect(!result.ok && result.error.kind).toBe('rateLimited');
  });
});

describe('GetRecommendations', () => {
  const setup = () => new GetRecommendations(new FakeCountryRepository(), new FakePlaceContentRepository());

  it('suggests featured destinations when nothing has been viewed', async () => {
    const result = await setup().execute({ recentlyViewed: [], limit: 3 });
    expect(result.ok && result.value.map(({ destination, reason }) => [destination.id, reason.type])).toEqual([
      ['kyoto', 'popular'],
      ['santorini', 'popular'],
      ['banff-national-park', 'popular'],
    ]);
  });

  it('recommends places sharing a category with what was viewed, explaining why', async () => {
    const result = await setup().execute({ recentlyViewed: [recent('kyoto', 'Kyoto', 'JP')], limit: 4 });

    if (!result.ok) throw result.error;
    const [first] = result.value;
    // Same categories (city + culture) and same region (Asia): Tbilisi scores highest.
    expect(first).toMatchObject({ destination: { id: 'tbilisi' }, reason: { type: 'similar', basedOn: 'Kyoto' } });
    expect(result.value.map(({ destination }) => destination.id)).not.toContain('kyoto');
  });

  it('recognises a curated place opened from search (by title) and never recommends it back', async () => {
    const lisbonFromSearch = recent(placeDestinationId('Lisbon', 'PT'), 'Lisbon', 'PT');
    const result = await setup().execute({ recentlyViewed: [lisbonFromSearch], limit: 20 });

    if (!result.ok) throw result.error;
    const ids = result.value.map(({ destination }) => destination.id);
    expect(ids).not.toContain('lisbon');
    expect(ids).toContain('porto');
  });

  it('suggests large countries in a viewed region, excluding viewed ones', async () => {
    const viewedPortugal = recent(countryDestinationId('PT'), 'Portugal', 'PT');
    const result = await setup().execute({ recentlyViewed: [viewedPortugal], limit: 20 });

    if (!result.ok) throw result.error;
    const countries = result.value.filter(({ destination }) => destination.kind === 'country');
    expect(countries.map(({ destination }) => destination.name)).toEqual(['France', 'Spain', 'Iceland']);
    expect(countries[0]?.reason).toEqual({ type: 'sameRegion', region: 'Europe' });
  });

  it('respects the limit', async () => {
    const result = await setup().execute({ recentlyViewed: [recent('kyoto', 'Kyoto', 'JP')], limit: 2 });
    expect(result.ok && result.value).toHaveLength(2);
  });

  it('fails when the catalogue fails', async () => {
    const countries = new FakeCountryRepository();
    countries.allError = new AppError('offline', 'offline');
    const result = await new GetRecommendations(countries, new FakePlaceContentRepository()).execute({
      recentlyViewed: [],
    });
    expect(!result.ok && result.error.kind).toBe('offline');
  });
});
