import { AppError } from '@/core/errors/AppError';
import { type CountryDto } from '@/features/discover/data/dto/restCountriesDtos';
import { toCountry } from '@/features/discover/data/mappers';
import { countryDto, FakeCountryRepository, FakePlaceContentRepository } from '@/testing/discoverFixtures';

import { NO_FILTERS, type SearchFilters } from '../SearchFilters';
import { MAX_RESULTS, SearchDestinations } from './SearchDestinations';

function setup() {
  const countries = new FakeCountryRepository();
  const content = new FakePlaceContentRepository();
  const useCase = new SearchDestinations(countries, content);
  const search = (query: string, filters: Partial<SearchFilters> = {}) =>
    useCase.execute({ query, filters: { ...NO_FILTERS, ...filters } });
  return { countries, content, search };
}

/** `count` African countries named "Country 000"… with capitals "Capital 000"…, more than any cap. */
const manyCountries = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const suffix = String(index).padStart(3, '0');
    const code = `${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + (index % 26))}`;
    return toCountry(
      countryDto(code, `Country ${suffix}`, {
        region: 'Africa',
        subregion: 'Western Africa',
        capitals: [{ name: `Capital ${suffix}`, attributes: { primary: true } }],
      }) as CountryDto,
    );
  });

const names = (result: Awaited<ReturnType<ReturnType<typeof setup>['search']>>) =>
  result.ok ? result.value.results.map((destination) => destination.name) : result.error.kind;

describe('SearchDestinations', () => {
  it('is idle for an empty query without filters, and makes no request', async () => {
    const { search, countries, content } = setup();

    await expect(search('   ')).resolves.toEqual({
      ok: true,
      value: { mode: 'idle', results: [], places: { status: 'skipped' } },
    });
    expect(countries.getAll).not.toHaveBeenCalled();
    expect(content.searchTitles).not.toHaveBeenCalled();
  });

  it('finds countries, capitals and curated destinations, best match first', async () => {
    const { search } = setup();

    const result = await search('lis');

    // "Lisbon" is both a capital (catalogue) and a curated destination: one result, not two.
    // A prefix match outranks a substring match ("Tbilisi").
    expect(names(result)).toEqual(['Lisbon', 'Tbilisi']);
  });

  it('matches regardless of case and accents', async () => {
    const { search } = setup();
    expect(names(await search('REYKJAVIK'))).toEqual(['Reykjavík']);
    expect(names(await search('  japan '))).toEqual(['Japan']);
  });

  it('adds Wikipedia places, dropping hits that are not places', async () => {
    const { search, content } = setup();
    content.hits = [
      { title: 'Kyoto', description: 'City in the Kansai region of Japan', thumbnailUrl: 'https://x/k.jpg' },
      { title: 'Kyoto Protocol', description: '1997 international treaty', thumbnailUrl: null },
      { title: 'Kyoto Sanga FC', description: 'Japanese association football club', thumbnailUrl: null },
    ];

    const result = await search('kyoto');

    expect(names(result)).toEqual(['Kyoto']);
    expect(result.ok && result.value.places).toEqual({ status: 'included' });
    expect(content.searchTitles).toHaveBeenCalledWith('kyoto', 12, undefined);
  });

  it('does not search Wikipedia for very short queries', async () => {
    const { search, content } = setup();
    const result = await search('pt');
    expect(names(result)).toEqual(['Portugal']);
    expect(result.ok && result.value.places).toEqual({ status: 'skipped' });
    expect(content.searchTitles).not.toHaveBeenCalled();
  });

  it('still returns local results when Wikipedia fails, and says so', async () => {
    const { search, content } = setup();
    content.searchError = new AppError('rateLimited', '429');

    const result = await search('mexico');

    expect(names(result)).toEqual(['Mexico', 'Mexico City']);
    expect(result.ok && result.value.places).toEqual({ status: 'failed', errorKind: 'rateLimited' });
  });

  it('fails when the country catalogue cannot be loaded', async () => {
    const { search, countries } = setup();
    countries.allError = new AppError('offline', 'offline');
    expect(names(await search('portugal'))).toBe('offline');
  });

  it('propagates cancellation instead of returning partial results', async () => {
    const { search, content } = setup();
    content.searchError = new AppError('cancelled', 'superseded');
    expect(names(await search('portugal'))).toBe('cancelled');
  });

  it('returns an empty list when nothing matches', async () => {
    const { search } = setup();
    const result = await search('zzzzqx');
    expect(result.ok && result.value).toEqual({ mode: 'search', results: [], places: { status: 'included' } });
  });

  it('applies filters to search results', async () => {
    const { search, content } = setup();
    content.hits = [{ title: 'Kingston upon Hull', description: 'City in England', thumbnailUrl: null }];

    // Kingston (Jamaica) matches; the English city has no known country, so a region filter drops it.
    expect(names(await search('kingston', { region: 'Americas' }))).toEqual(['Kingston']);
    expect(names(await search('kingston', { region: 'Europe' }))).toEqual([]);
  });

  it('browses by filters alone, without a query', async () => {
    const { search, content } = setup();

    const asia = await search('', { region: 'Asia' });
    expect(asia.ok && asia.value.mode).toBe('browse');
    // Countries and curated destinations in Asia, alphabetically.
    expect(names(asia)).toEqual(['Georgia', 'Japan', 'Kyoto', 'Tbilisi']);

    const cities = await search('', { category: 'city', currencyCode: 'EUR' });
    // Capitals of euro countries plus curated cities in them (Lisbon is both, listed once).
    expect(names(cities)).toEqual(['Lisbon', 'Madrid', 'Paris', 'Porto']);
    expect(content.searchTitles).not.toHaveBeenCalled();
  });

  it('caps ranked search results', async () => {
    const countries = new FakeCountryRepository(manyCountries(MAX_RESULTS + 10));
    const useCase = new SearchDestinations(countries, new FakePlaceContentRepository());
    // "co" matches every generated country, so ranking produces more than the cap.
    const result = await useCase.execute({ query: 'co', filters: NO_FILTERS });
    expect(result.ok && result.value.results).toHaveLength(MAX_RESULTS);
  });

  it('does not cap browsing, so the end of the alphabet is reachable', async () => {
    const count = MAX_RESULTS + 10;
    const countries = new FakeCountryRepository(manyCountries(count));
    const useCase = new SearchDestinations(countries, new FakePlaceContentRepository());

    const region = await useCase.execute({ query: '', filters: { ...NO_FILTERS, region: 'Africa' } });
    if (!region.ok) throw region.error;
    // Generated codes can coincide with curated destinations' countries, so count the country rows only.
    const countryNames = region.value.results
      .filter((result) => result.kind === 'country')
      .map((result) => result.name);
    expect(countryNames).toHaveLength(count);
    expect(countryNames.at(-1)).toBe(`Country ${String(count - 1).padStart(3, '0')}`);

    // Every generated country has a capital, so the city browse holds at least as many entries again.
    const cities = await useCase.execute({ query: '', filters: { ...NO_FILTERS, category: 'city' } });
    expect(cities.ok && cities.value.results.length).toBeGreaterThanOrEqual(count);
  });
});
