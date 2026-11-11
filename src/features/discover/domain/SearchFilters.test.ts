import { countryByCode, WORLD } from '@/testing/discoverFixtures';

import { type DestinationSummary } from './Destination';
import {
  applyFilters,
  buildFilterOptions,
  countActiveFilters,
  isWithinPopulation,
  NO_FILTERS,
  POPULATION_RANGES,
  populationRangeId,
  type SearchFilters,
} from './SearchFilters';
import { capitalToSummary, countryToSummary } from './searchMatching';

const byCode = new Map(WORLD.map((country) => [country.code, country]));
const filters = (patch: Partial<SearchFilters>): SearchFilters => ({ ...NO_FILTERS, ...patch });

const place = (
  name: string,
  countryCode: string | null,
  categories: DestinationSummary['categories'],
): DestinationSummary => ({
  id: name.toLowerCase(),
  kind: 'place',
  name,
  countryCode,
  countryName: null,
  region: null,
  description: null,
  imageUrl: null,
  flagEmoji: null,
  categories,
  isCapital: false,
});

const ALL: DestinationSummary[] = [
  ...WORLD.map(countryToSummary),
  capitalToSummary('Lisbon', countryByCode('PT')),
  capitalToSummary('Tokyo', countryByCode('JP')),
  place('Santorini', 'GR', ['island', 'beach']),
  place('Sintra', 'PT', ['culture']),
  place('Somewhere', null, ['nature']),
];
const names = (patch: Partial<SearchFilters>) => applyFilters(ALL, filters(patch), byCode).map((d) => d.name);

describe('applyFilters', () => {
  it('keeps everything with no filters', () => {
    expect(names({})).toHaveLength(ALL.length);
  });

  it('filters by country, including cities and places in it', () => {
    expect(names({ countryCode: 'PT' })).toEqual(['Portugal', 'Lisbon', 'Sintra']);
  });

  it('filters by region through each destination’s country', () => {
    expect(names({ region: 'Asia' })).toEqual(['Japan', 'Georgia', 'Tokyo']);
  });

  it('filters by currency', () => {
    expect(names({ currencyCode: 'JPY' })).toEqual(['Japan', 'Tokyo']);
    expect(names({ currencyCode: 'EUR' })).toEqual(['Portugal', 'Spain', 'France', 'Lisbon', 'Sintra']);
  });

  it('filters by country population range (inclusive bounds)', () => {
    expect(names({ population: POPULATION_RANGES.under1m })).toEqual(['Iceland']);
    expect(names({ population: POPULATION_RANGES.over100m })).toEqual(['Japan', 'Mexico', 'Tokyo']);
    expect(isWithinPopulation(1_000_000, POPULATION_RANGES.from1mTo10m)).toBe(true);
    expect(isWithinPopulation(999_999, POPULATION_RANGES.from1mTo10m)).toBe(false);
    expect(isWithinPopulation(null, POPULATION_RANGES.from1mTo10m)).toBe(false);
  });

  it('filters by category; countries have none', () => {
    expect(names({ category: 'island' })).toEqual(['Santorini']);
    expect(names({ category: 'city' })).toEqual(['Lisbon', 'Tokyo']);
  });

  it('combines filters with AND', () => {
    expect(names({ region: 'Europe', category: 'culture' })).toEqual(['Sintra']);
    expect(names({ region: 'Europe', currencyCode: 'JPY' })).toEqual([]);
  });

  it('drops destinations whose country is unknown when a country-level filter is on', () => {
    // GR is not in the fixture catalogue, and "Somewhere" has no country at all.
    expect(names({ region: 'Europe' })).not.toContain('Santorini');
    expect(names({ region: 'Europe' })).not.toContain('Somewhere');
    expect(names({ category: 'nature' })).toEqual(['Somewhere']);
  });
});

describe('filter helpers', () => {
  it('counts active filters', () => {
    expect(countActiveFilters(NO_FILTERS)).toBe(0);
    expect(countActiveFilters(filters({ region: 'Asia', category: 'city' }))).toBe(2);
  });

  it('identifies preset population ranges', () => {
    expect(populationRangeId(POPULATION_RANGES.from10mTo50m)).toBe('from10mTo50m');
    expect(populationRangeId({ min: 5, max: 6 })).toBeNull();
    expect(populationRangeId(null)).toBeNull();
  });

  it('builds sorted, de-duplicated filter options from the catalogue', () => {
    const options = buildFilterOptions(WORLD);
    expect(options.regions).toEqual(['Americas', 'Asia', 'Europe']);
    expect(options.currencies.map((currency) => currency.code)).toEqual(['EUR', 'GEL', 'ISK', 'JMD', 'JPY', 'MXN']);
    expect(options.countries[0]).toEqual({ code: 'FR', name: 'France', flagEmoji: '🏳️' });
  });
});
