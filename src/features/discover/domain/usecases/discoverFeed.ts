import { type AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';

import { type Country } from '../Country';
import { type DestinationCategory, type DestinationSummary, type RecentDestination } from '../Destination';
import { parseDestinationId } from '../DestinationId';
import {
  CURATED_DESTINATIONS,
  type CuratedDestination,
  curatedBySlugs,
  FEATURED_SLUGS,
  findCuratedBySlug,
  findCuratedByTitle,
  POPULAR_COUNTRY_CODES,
  TRENDING_SLUGS,
} from '../editorial';
import { type CountryRepository, type PlaceContentRepository } from '../repositories';
import { countryToSummary, curatedToSummary } from '../searchMatching';

type CountryIndex = ReadonlyMap<string, Country>;

interface LoadedCountryIndex {
  readonly index: CountryIndex;
  /** Why the catalogue couldn't be loaded (the index is then empty), or `null`. */
  readonly error: AppError | null;
}

/** The catalogue as a lookup, or an empty one with the reason if it can't be loaded (only cancellation is an error). */
async function loadCountryIndex(
  countries: Pick<CountryRepository, 'getAll'>,
  signal?: AbortSignal,
): Promise<Result<LoadedCountryIndex, AppError>> {
  const catalog = await countries.getAll(signal);
  if (catalog.ok) return ok({ index: new Map(catalog.value.map((country) => [country.code, country])), error: null });
  return catalog.error.kind === 'cancelled' ? catalog : ok({ index: new Map(), error: catalog.error });
}

interface EnrichedCurated {
  readonly destinations: DestinationSummary[];
  /** Set when every summary request failed, so no card got a photo or description. */
  readonly allFailed: AppError | null;
}

/**
 * Curated destinations with their Wikipedia photo and short description. Every
 * piece is optional: a missing article, photo or country leaves that field empty
 * (the card shows a placeholder) instead of failing the section. Only
 * cancellation fails, so a half-loaded list is never cached; callers decide
 * whether `allFailed` should fail them.
 */
async function enrichCurated(
  curated: readonly CuratedDestination[],
  countriesByCode: CountryIndex,
  content: Pick<PlaceContentRepository, 'getSummary'>,
  signal?: AbortSignal,
): Promise<Result<EnrichedCurated, AppError>> {
  const summaries = await Promise.all(
    curated.map((destination) => content.getSummary(destination.wikipediaTitle, signal)),
  );
  const cancelled = summaries.find((result) => !result.ok && result.error.kind === 'cancelled');
  if (cancelled && !cancelled.ok) return err(cancelled.error);

  const [first] = summaries;
  const allFailed = first && !first.ok && summaries.every((result) => !result.ok) ? first.error : null;

  return ok({
    allFailed,
    destinations: curated.map((destination, index) => {
      const summary = summaries[index];
      const article = summary?.ok ? summary.value : null;
      return {
        ...curatedToSummary(destination, countriesByCode.get(destination.countryCode) ?? null),
        description: article?.description ?? null,
        imageUrl: article?.thumbnailUrl ?? null,
      };
    }),
  });
}

// ─── Featured and trending ──────────────────────────────────────────────────

export type CuratedCollection = 'featured' | 'trending';

const COLLECTIONS: Record<CuratedCollection, readonly string[]> = {
  featured: FEATURED_SLUGS,
  trending: TRENDING_SLUGS,
};

export interface GetCuratedCollectionInput {
  readonly collection: CuratedCollection;
  readonly signal?: AbortSignal;
}

export class GetCuratedCollection implements UseCase<
  GetCuratedCollectionInput,
  Result<DestinationSummary[], AppError>
> {
  constructor(
    private readonly countries: Pick<CountryRepository, 'getAll'>,
    private readonly content: Pick<PlaceContentRepository, 'getSummary'>,
  ) {}

  async execute({ collection, signal }: GetCuratedCollectionInput): Promise<Result<DestinationSummary[], AppError>> {
    const loaded = await loadCountryIndex(this.countries, signal);
    if (!loaded.ok) return loaded;
    // A failure that retrying can fix (offline, timeout, server, rate limit) fails the section, so it shows
    // a retry and the bare cards aren't cached as a success. A missing API key won't fix itself, so the
    // cards go without their country instead.
    const { index, error } = loaded.value;
    if (error && error.kind !== 'configuration') return err(error);

    const enriched = await enrichCurated(curatedBySlugs(COLLECTIONS[collection]), index, this.content, signal);
    if (!enriched.ok) return enriched;
    if (enriched.value.allFailed) return err(enriched.value.allFailed);
    return ok(enriched.value.destinations);
  }
}

// ─── Popular countries ──────────────────────────────────────────────────────

export interface GetPopularCountriesInput {
  readonly signal?: AbortSignal;
}

/** The most-visited countries, in editorial order; any the API doesn't return are skipped. */
export class GetPopularCountries implements UseCase<GetPopularCountriesInput, Result<DestinationSummary[], AppError>> {
  constructor(private readonly countries: Pick<CountryRepository, 'getAll'>) {}

  async execute({ signal }: GetPopularCountriesInput = {}): Promise<Result<DestinationSummary[], AppError>> {
    const catalog = await this.countries.getAll(signal);
    if (!catalog.ok) return catalog;
    const byCode = new Map(catalog.value.map((country) => [country.code, country]));
    return ok(POPULAR_COUNTRY_CODES.flatMap((code) => byCode.get(code) ?? []).map(countryToSummary));
  }
}

// ─── Recommendations ────────────────────────────────────────────────────────

export type RecommendationReason =
  | { readonly type: 'similar'; readonly basedOn: string }
  | { readonly type: 'sameRegion'; readonly region: string }
  | { readonly type: 'popular' };

export interface Recommendation {
  readonly destination: DestinationSummary;
  readonly reason: RecommendationReason;
}

export interface GetRecommendationsInput {
  readonly recentlyViewed: readonly RecentDestination[];
  readonly limit?: number;
  readonly signal?: AbortSignal;
}

const DEFAULT_RECOMMENDATIONS = 8;
/** Countries suggested per viewed region, most populous first. */
const COUNTRIES_PER_REGION = 3;

type Candidate = { readonly score: number; readonly reason: RecommendationReason } & (
  | { readonly curated: CuratedDestination; readonly country?: never }
  | { readonly country: Country; readonly curated?: never }
);

function curatedFor(recent: RecentDestination): CuratedDestination | null {
  const ref = parseDestinationId(recent.id);
  if (ref?.kind === 'curated') return findCuratedBySlug(ref.slug);
  if (ref?.kind === 'place') return findCuratedByTitle(ref.title);
  return null;
}

/**
 * Rule-based, on-device recommendations from what the user has viewed:
 * curated places sharing a category with a viewed place score 2 per category, a
 * curated place or large country in a viewed region scores 1. Anything already
 * viewed is excluded. With no history, featured destinations are suggested.
 */
export class GetRecommendations implements UseCase<GetRecommendationsInput, Result<Recommendation[], AppError>> {
  constructor(
    private readonly countries: Pick<CountryRepository, 'getAll'>,
    private readonly content: Pick<PlaceContentRepository, 'getSummary'>,
  ) {}

  async execute({
    recentlyViewed,
    limit = DEFAULT_RECOMMENDATIONS,
    signal,
  }: GetRecommendationsInput): Promise<Result<Recommendation[], AppError>> {
    const catalog = await this.countries.getAll(signal);
    if (!catalog.ok) return catalog;
    const byCode: CountryIndex = new Map(catalog.value.map((country) => [country.code, country]));

    const candidates =
      recentlyViewed.length === 0
        ? curatedBySlugs(FEATURED_SLUGS).map((curated): Candidate => ({
            curated,
            score: 0,
            reason: { type: 'popular' },
          }))
        : rankFromHistory(recentlyViewed, catalog.value, byCode);

    return this.materialize(candidates.slice(0, limit), byCode, signal);
  }

  private async materialize(
    candidates: readonly Candidate[],
    byCode: CountryIndex,
    signal: AbortSignal | undefined,
  ): Promise<Result<Recommendation[], AppError>> {
    const curated = candidates.flatMap((candidate) => (candidate.curated ? [candidate.curated] : []));
    const enriched = await enrichCurated(curated, byCode, this.content, signal);
    if (!enriched.ok) return enriched;
    // Recommendations stay useful without photos, so `allFailed` doesn't fail them.
    const bySlug = new Map(enriched.value.destinations.map((destination) => [destination.id, destination]));

    return ok(
      candidates.flatMap((candidate): Recommendation[] => {
        const destination = candidate.curated
          ? bySlug.get(candidate.curated.slug)
          : countryToSummary(candidate.country);
        return destination ? [{ destination, reason: candidate.reason }] : [];
      }),
    );
  }
}

function rankFromHistory(
  recentlyViewed: readonly RecentDestination[],
  catalog: readonly Country[],
  byCode: CountryIndex,
): Candidate[] {
  const viewedIds = new Set(recentlyViewed.map((recent) => recent.id));
  const viewedSlugs = new Set<string>();
  /** Category → name of the most recent viewed place that has it. */
  const categorySource = new Map<DestinationCategory, string>();
  const viewedRegions = new Set<string>();

  for (const recent of recentlyViewed) {
    const curated = curatedFor(recent);
    if (curated) {
      viewedSlugs.add(curated.slug);
      for (const category of curated.categories) {
        if (!categorySource.has(category)) categorySource.set(category, recent.name);
      }
    }
    const region = recent.countryCode ? byCode.get(recent.countryCode)?.region : null;
    if (region) viewedRegions.add(region);
  }

  const candidates: Candidate[] = [];
  for (const curated of CURATED_DESTINATIONS) {
    if (viewedSlugs.has(curated.slug)) continue;
    const shared = curated.categories.filter((category) => categorySource.has(category));
    const region = byCode.get(curated.countryCode)?.region ?? null;
    const inViewedRegion = region !== null && viewedRegions.has(region);
    const score = shared.length * 2 + (inViewedRegion ? 1 : 0);
    if (score === 0) continue;
    const [firstShared] = shared;
    const reason: RecommendationReason =
      firstShared !== undefined
        ? { type: 'similar', basedOn: categorySource.get(firstShared) ?? '' }
        : { type: 'sameRegion', region: region ?? '' };
    candidates.push({ curated, score, reason });
  }

  for (const region of viewedRegions) {
    catalog
      .filter((country) => country.region === region && !viewedIds.has(countryToSummary(country).id))
      .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
      .slice(0, COUNTRIES_PER_REGION)
      .forEach((country) => candidates.push({ country, score: 1, reason: { type: 'sameRegion', region } }));
  }

  // Array.prototype.sort is stable: equal scores keep editorial order, curated places before countries.
  return candidates.sort((a, b) => b.score - a.score);
}
