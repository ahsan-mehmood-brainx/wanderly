import { type AppError, type AppErrorKind } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';

import { type Country } from '../Country';
import { type DestinationSummary } from '../Destination';
import { CURATED_DESTINATIONS } from '../editorial';
import { type CountryRepository, type PlaceContentRepository } from '../repositories';
import { applyFilters, hasActiveFilters, type SearchFilters } from '../SearchFilters';
import {
  capitalToSummary,
  countryToSummary,
  curatedToSummary,
  matchCountriesAndCapitals,
  matchCurated,
  normalizeQuery,
  normalizeText,
  placeHitToSummary,
  rankResults,
  type ScoredDestination,
} from '../searchMatching';

export interface SearchDestinationsInput {
  readonly query: string;
  readonly filters: SearchFilters;
  readonly signal?: AbortSignal;
}

/**
 * - `included`: Wikipedia places are part of the results.
 * - `skipped`: not searched (query too short, or browsing by filters only).
 * - `failed`: Wikipedia was unavailable; results are countries, capitals and curated places only.
 */
export type PlacesStatus =
  | { readonly status: 'included' }
  | { readonly status: 'skipped' }
  | { readonly status: 'failed'; readonly errorKind: AppErrorKind };

export interface SearchOutcome {
  /** `idle`: nothing to search for (empty query, no filters). */
  readonly mode: 'idle' | 'search' | 'browse';
  readonly results: readonly DestinationSummary[];
  readonly places: PlacesStatus;
}

/** Wikipedia is searched from this many characters; shorter queries match too much to be useful. */
export const MIN_REMOTE_QUERY_LENGTH = 3;
/** Search results are ranked, so the tail past this is low relevance. Browse results are not capped. */
export const MAX_RESULTS = 50;
const WIKIPEDIA_HITS = 12;

/**
 * Searches countries, cities and destinations.
 *
 * Countries and capitals are matched locally against the cached catalogue (one
 * fetch per session), so typing never spends the REST Countries rate limit. Other
 * cities and places come from Wikipedia title search, filtered to hits that
 * describe a place. Wikipedia is best-effort: if it fails, local results are still
 * returned with `places.status = 'failed'`. Only a failure to load the catalogue
 * (or cancellation) fails the search.
 *
 * With an empty query and active filters, it browses: every country and curated
 * destination matching the filters, alphabetically and uncapped.
 */
export class SearchDestinations implements UseCase<SearchDestinationsInput, Result<SearchOutcome, AppError>> {
  constructor(
    private readonly countries: Pick<CountryRepository, 'getAll'>,
    private readonly content: Pick<PlaceContentRepository, 'searchTitles'>,
  ) {}

  async execute({ query, filters, signal }: SearchDestinationsInput): Promise<Result<SearchOutcome, AppError>> {
    const text = normalizeQuery(query);
    const normalized = normalizeText(text);
    if (!normalized && !hasActiveFilters(filters))
      return ok({ mode: 'idle', results: [], places: { status: 'skipped' } });

    const catalog = await this.countries.getAll(signal);
    if (!catalog.ok) return catalog;
    const countriesByCode = new Map(catalog.value.map((country) => [country.code, country]));

    if (!normalized) {
      const results = applyFilters(
        rankResults(browseAll(catalog.value, filters, countriesByCode)),
        filters,
        countriesByCode,
      );
      // Not capped: browse results are alphabetical, so a cap would hide later letters rather than weak
      // matches. The full list (a few hundred rows at most) renders in a virtualised list.
      return ok({ mode: 'browse', results, places: { status: 'skipped' } });
    }

    const local = matchCountriesAndCapitals(normalized, catalog.value);
    const curated = matchCurated(normalized, CURATED_DESTINATIONS, countriesByCode);

    let remote: ScoredDestination[] = [];
    let places: PlacesStatus = { status: 'skipped' };
    if (normalized.length >= MIN_REMOTE_QUERY_LENGTH) {
      const hits = await this.content.searchTitles(text, WIKIPEDIA_HITS, signal);
      if (hits.ok) {
        remote = hits.value.flatMap((hit, rank) => placeHitToSummary(hit, catalog.value, rank) ?? []);
        places = { status: 'included' };
      } else if (hits.error.kind === 'cancelled') {
        return err(hits.error);
      } else {
        places = { status: 'failed', errorKind: hits.error.kind };
      }
    }

    const results = applyFilters(rankResults(local, curated, remote), filters, countriesByCode);
    return ok({ mode: 'search', results: results.slice(0, MAX_RESULTS), places });
  }
}

/** Browse mode: countries, curated places and (for the "city" category) capitals, equally ranked so they sort by name. */
function browseAll(
  countries: readonly Country[],
  filters: SearchFilters,
  countriesByCode: ReadonlyMap<string, Country>,
): ScoredDestination[] {
  const all: ScoredDestination[] = CURATED_DESTINATIONS.map((curated) => ({
    destination: curatedToSummary(curated, countriesByCode.get(curated.countryCode) ?? null),
    score: 1,
  }));
  for (const country of countries) {
    all.push({ destination: countryToSummary(country), score: 1 });
    if (filters.category === 'city') {
      for (const capital of country.capitals) all.push({ destination: capitalToSummary(capital, country), score: 1 });
    }
  }
  return all;
}
