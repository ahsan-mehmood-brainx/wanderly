import { AppError } from '@/core/errors/AppError';
import { ApiError } from '@/core/http/ApiError';
import { err, ok, type Result } from '@/core/result';
import { type CountryDto } from '@/features/discover/data/dto/restCountriesDtos';
import { toCountry } from '@/features/discover/data/mappers';
import { summaryPath, SEARCH_PATH } from '@/features/discover/data/WikipediaPlaceContentRepository';
import { type Country } from '@/features/discover/domain/Country';
import { type PlaceSearchHit, type PlaceSummary } from '@/features/discover/domain/Destination';
import { type CountryRepository, type PlaceContentRepository } from '@/features/discover/domain/repositories';

import { apiFailure, apiSuccess, type FakeHttpClient, type FakeHttpClientFactory } from './FakeHttpClient';

/** Builds a REST Countries v5 object (the wire format), with sensible defaults for every field. */
export function countryDto(
  code: string,
  name: string,
  overrides: Partial<Record<keyof CountryDto, unknown>> = {},
): Record<string, unknown> {
  return {
    names: { common: name, official: `Republic of ${name}`, alternates: [] },
    codes: { alpha_2: code, alpha_3: `${code}X` },
    capitals: [{ name: `${name} City`, attributes: { primary: true } }],
    region: 'Europe',
    subregion: 'Southern Europe',
    population: 10_000_000,
    area: { kilometers: 92_000 },
    flag: {
      url_png: `https://flags.restcountries.com/v5/w640/${code.toLowerCase()}.png`,
      url_svg: null,
      emoji: '🏳️',
      description: `The flag of ${name}.`,
    },
    currencies: [{ code: 'EUR', name: 'Euro', symbol: '€' }],
    languages: [{ name: 'English' }],
    coordinates: { lat: 1, lng: 2 },
    timezones: ['UTC'],
    borders: [],
    calling_codes: ['1'],
    cars: { driving_side: 'right' },
    landlocked: false,
    links: { wikipedia: `https://en.wikipedia.org/wiki/${name.replace(/ /g, '_')}` },
    ...overrides,
  };
}

/** A small but realistic world: names, regions, currencies and populations that the tests rely on. */
export const WORLD_DTOS = [
  countryDto('PT', 'Portugal', {
    codes: { alpha_2: 'PT', alpha_3: 'PRT' },
    capitals: [{ name: 'Lisbon', attributes: { primary: true } }],
    population: 10_639_726,
    borders: ['ESP'],
    calling_codes: ['351'],
    languages: [{ name: 'Portuguese' }],
  }),
  countryDto('ES', 'Spain', {
    codes: { alpha_2: 'ES', alpha_3: 'ESP' },
    capitals: [{ name: 'Madrid', attributes: { primary: true } }],
    population: 47_450_795,
    borders: ['PRT', 'FRA'],
  }),
  countryDto('FR', 'France', {
    codes: { alpha_2: 'FR', alpha_3: 'FRA' },
    capitals: [{ name: 'Paris', attributes: { primary: true } }],
    subregion: 'Western Europe',
    population: 68_000_000,
    borders: ['ESP'],
  }),
  countryDto('IS', 'Iceland', {
    codes: { alpha_2: 'IS', alpha_3: 'ISL' },
    capitals: [{ name: 'Reykjavík', attributes: { primary: true } }],
    subregion: 'Northern Europe',
    population: 380_000,
    currencies: [{ code: 'ISK', name: 'Icelandic króna', symbol: 'kr' }],
  }),
  countryDto('JP', 'Japan', {
    codes: { alpha_2: 'JP', alpha_3: 'JPN' },
    capitals: [{ name: 'Tokyo', attributes: { primary: true } }],
    region: 'Asia',
    subregion: 'Eastern Asia',
    population: 124_000_000,
    currencies: [{ code: 'JPY', name: 'Japanese yen', symbol: '¥' }],
    cars: { driving_side: 'left' },
  }),
  countryDto('GE', 'Georgia', {
    codes: { alpha_2: 'GE', alpha_3: 'GEO' },
    capitals: [{ name: 'Tbilisi', attributes: { primary: true } }],
    region: 'Asia',
    subregion: 'Western Asia',
    population: 3_700_000,
    currencies: [{ code: 'GEL', name: 'Georgian lari', symbol: '₾' }],
    links: { wikipedia: 'https://en.wikipedia.org/wiki/Georgia_(country)' },
  }),
  countryDto('MX', 'Mexico', {
    codes: { alpha_2: 'MX', alpha_3: 'MEX' },
    capitals: [{ name: 'Mexico City', attributes: { primary: true } }],
    region: 'Americas',
    subregion: 'North America',
    population: 129_000_000,
    currencies: [{ code: 'MXN', name: 'Mexican peso', symbol: '$' }],
  }),
  countryDto('JM', 'Jamaica', {
    codes: { alpha_2: 'JM', alpha_3: 'JAM' },
    capitals: [{ name: 'Kingston', attributes: { primary: true } }],
    region: 'Americas',
    subregion: 'Caribbean',
    population: 2_800_000,
    currencies: [{ code: 'JMD', name: 'Jamaican dollar', symbol: '$' }],
    cars: { driving_side: 'left' },
  }),
];

export const WORLD: readonly Country[] = WORLD_DTOS.map((dto) => toCountry(dto as CountryDto));

export const countryByCode = (code: string): Country => {
  const country = WORLD.find((candidate) => candidate.code === code);
  if (!country) throw new Error(`No fixture country ${code}`);
  return country;
};

/** The v5 list envelope. */
export function countryPage(objects: readonly unknown[], meta: { more?: boolean; total?: number } = {}) {
  return { data: { objects, meta: { total: objects.length, more: false, ...meta }, _demo: null } };
}

export function placeSummary(title: string, overrides: Partial<PlaceSummary> = {}): PlaceSummary {
  return {
    title,
    description: `City in ${title}land`,
    extract: `${title} is a lovely place.`,
    thumbnailUrl: `https://upload.wikimedia.org/${encodeURIComponent(title)}-320.jpg`,
    imageUrl: `https://upload.wikimedia.org/${encodeURIComponent(title)}.jpg`,
    articleUrl: `https://en.m.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    coordinates: null,
    ...overrides,
  };
}

/** Wikipedia's page-summary payload for `placeSummary`-like content. */
export function summaryDto(title: string, overrides: Record<string, unknown> = {}) {
  return {
    type: 'standard',
    title,
    description: `City in ${title}land`,
    extract: `${title} is a lovely place.`,
    thumbnail: { source: `https://upload.wikimedia.org/${title}-320.jpg`, width: 320, height: 213 },
    originalimage: { source: `https://upload.wikimedia.org/${title}.jpg`, width: 1600, height: 1067 },
    content_urls: { mobile: { page: `https://en.m.wikipedia.org/wiki/${title}` } },
    ...overrides,
  };
}

export const httpFailure = (kind: AppError['kind'], status?: number, retryAfterMs?: number) =>
  apiFailure(new ApiError(kind, `Request failed (${kind})`, { status, retryAfterMs }));

/**
 * Scripts REST Countries and Wikipedia on a {@link FakeHttpClientFactory}: the
 * catalogue and per-country lookups serve {@link WORLD_DTOS}; Wikipedia answers
 * every summary with an article named after the title and has no search hits.
 */
export function stubDiscoverApis(factory: FakeHttpClientFactory) {
  const restCountries: FakeHttpClient = factory.client('restcountries');
  const wikipedia: FakeHttpClient = factory.client('wikipedia');

  restCountries.on('GET', '', apiSuccess(countryPage(WORLD_DTOS)));
  for (const dto of WORLD_DTOS) {
    const code = (dto.codes as { alpha_2: string }).alpha_2;
    restCountries.on('GET', `/codes.alpha_2/${code}`, apiSuccess(countryPage([dto])));
  }

  wikipedia.on('GET', SEARCH_PATH, apiSuccess({ pages: [] }));
  // Every article exists unless a test stubs its path (e.g. with a 404).
  wikipedia.otherwise((request) => {
    if (request.method !== 'GET' || !request.path.startsWith(SUMMARY_PREFIX)) return httpFailure('notFound', 404);
    const title = decodeURIComponent(request.path.slice(SUMMARY_PREFIX.length)).replace(/_/g, ' ');
    return apiSuccess(summaryDto(title));
  });

  return { restCountries, wikipedia };
}

const SUMMARY_PREFIX = summaryPath('');

/** Stateful CountryRepository double over {@link WORLD}, with switchable failures; methods are jest spies. */
export class FakeCountryRepository implements CountryRepository {
  countries: readonly Country[];
  allError: AppError | null = null;
  byCodeError: AppError | null = null;

  constructor(countries: readonly Country[] = WORLD) {
    this.countries = countries;
  }

  readonly getAll = jest.fn(async (): Promise<Result<readonly Country[], AppError>> => {
    return this.allError ? err(this.allError) : ok(this.countries);
  });

  readonly getByCode = jest.fn(async (code: string): Promise<Result<Country, AppError>> => {
    if (this.byCodeError) return err(this.byCodeError);
    const country = this.countries.find((candidate) => candidate.code === code.toUpperCase());
    return country ? ok(country) : err(new AppError('notFound', `No country ${code}`));
  });
}

/** PlaceContentRepository double: summaries by title (`null` = no article), scripted search hits. */
export class FakePlaceContentRepository implements PlaceContentRepository {
  /** Titles not listed get a generated article; map a title to `null` for "no article". */
  readonly summaries = new Map<string, PlaceSummary | null>();
  readonly summaryErrors = new Map<string, AppError>();
  hits: readonly PlaceSearchHit[] = [];
  searchError: AppError | null = null;

  readonly getSummary = jest.fn(async (title: string): Promise<Result<PlaceSummary | null, AppError>> => {
    const failure = this.summaryErrors.get(title);
    if (failure) return err(failure);
    return ok(this.summaries.has(title) ? (this.summaries.get(title) ?? null) : placeSummary(title));
  });

  readonly searchTitles = jest.fn(async (): Promise<Result<readonly PlaceSearchHit[], AppError>> => {
    return this.searchError ? err(this.searchError) : ok(this.hits);
  });
}
