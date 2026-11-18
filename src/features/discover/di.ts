import { type CoreDependencies } from '@/core/di/CoreDependencies';
import { type Factories } from '@/core/di/createContainer';
import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';

import { readRestCountriesApiKey, restCountriesApi, WIKIPEDIA_API } from './data/apis';
import { CachedCountryRepository, CachedPlaceContentRepository } from './data/caching';
import { RestCountriesRepository } from './data/RestCountriesRepository';
import { StorageDiscoveryHistoryRepository } from './data/StorageDiscoveryHistoryRepository';
import { WikipediaPlaceContentRepository } from './data/WikipediaPlaceContentRepository';
import { type DestinationDetails, type DestinationSummary, type RecentDestination } from './domain/Destination';
import {
  type CountryRepository,
  type DiscoveryHistoryRepository,
  type PlaceContentRepository,
} from './domain/repositories';
import { type FilterOptions } from './domain/SearchFilters';
import {
  GetCuratedCollection,
  type GetCuratedCollectionInput,
  GetPopularCountries,
  type GetPopularCountriesInput,
  GetRecommendations,
  type GetRecommendationsInput,
  type Recommendation,
} from './domain/usecases/discoverFeed';
import {
  ClearRecentlyViewed,
  ClearSearchHistory,
  DiscoveryHistory,
  type DiscoveryHistorySnapshot,
  ForgetSearch,
  LoadDiscoveryHistory,
  RecordDestinationView,
  RememberSearch,
} from './domain/usecases/discoveryHistory';
import { GetFilterOptions, type GetFilterOptionsInput } from './domain/usecases/GetFilterOptions';
import { GetDestinationDetails, type GetDestinationDetailsInput } from './domain/usecases/GetDestinationDetails';
import {
  SearchDestinations,
  type SearchDestinationsInput,
  type SearchOutcome,
} from './domain/usecases/SearchDestinations';

export interface DiscoverDependencies {
  /** REST Countries key from `EXPO_PUBLIC_RESTCOUNTRIES_API_KEY`; `null` when the build has none. */
  readonly restCountriesApiKey: string | null;
  readonly countryRepository: CountryRepository;
  readonly placeContentRepository: PlaceContentRepository;
  readonly discoveryHistoryRepository: DiscoveryHistoryRepository;
  readonly discoveryHistory: DiscoveryHistory;
  readonly searchDestinations: UseCase<SearchDestinationsInput, Result<SearchOutcome, AppError>>;
  readonly getDestinationDetails: UseCase<GetDestinationDetailsInput, Result<DestinationDetails, AppError>>;
  readonly getCuratedCollection: UseCase<GetCuratedCollectionInput, Result<DestinationSummary[], AppError>>;
  readonly getPopularCountries: UseCase<GetPopularCountriesInput, Result<DestinationSummary[], AppError>>;
  readonly getRecommendations: UseCase<GetRecommendationsInput, Result<Recommendation[], AppError>>;
  readonly getFilterOptions: UseCase<GetFilterOptionsInput, Result<FilterOptions, AppError>>;
  readonly loadDiscoveryHistory: UseCase<void, DiscoveryHistorySnapshot>;
  readonly rememberSearch: UseCase<string, readonly string[]>;
  readonly forgetSearch: UseCase<string, readonly string[]>;
  readonly clearSearchHistory: UseCase<void, readonly string[]>;
  readonly recordDestinationView: UseCase<RecentDestination, readonly RecentDestination[]>;
  readonly clearRecentlyViewed: UseCase<void, readonly RecentDestination[]>;
}

/**
 * Remote repositories are wrapped in in-memory caches (Decorator), so every use
 * case shares one country catalogue and one copy of each Wikipedia summary.
 */
export const discoverFactories: Factories<DiscoverDependencies, CoreDependencies & DiscoverDependencies> = {
  restCountriesApiKey: (c) => {
    const key = readRestCountriesApiKey();
    if (!key) {
      c.logger.warn('EXPO_PUBLIC_RESTCOUNTRIES_API_KEY is not set; country data is unavailable (see README)');
    }
    return key;
  },
  countryRepository: (c) =>
    new CachedCountryRepository(
      new RestCountriesRepository({
        http: c.httpClientFactory.create(restCountriesApi(c.restCountriesApiKey)),
        apiKey: c.restCountriesApiKey,
        logger: c.logger.child({ scope: 'restcountries' }),
      }),
      c.clock,
    ),
  placeContentRepository: (c) =>
    new CachedPlaceContentRepository(
      new WikipediaPlaceContentRepository(c.httpClientFactory.create(WIKIPEDIA_API)),
      c.clock,
    ),
  discoveryHistoryRepository: (c) =>
    new StorageDiscoveryHistoryRepository(c.keyValueStore, c.logger.child({ scope: 'discoveryHistory' })),
  discoveryHistory: (c) =>
    new DiscoveryHistory(c.discoveryHistoryRepository, c.logger.child({ scope: 'discoveryHistory' })),
  searchDestinations: (c) => new SearchDestinations(c.countryRepository, c.placeContentRepository),
  getDestinationDetails: (c) => new GetDestinationDetails(c.countryRepository, c.placeContentRepository),
  getCuratedCollection: (c) => new GetCuratedCollection(c.countryRepository, c.placeContentRepository),
  getPopularCountries: (c) => new GetPopularCountries(c.countryRepository),
  getRecommendations: (c) => new GetRecommendations(c.countryRepository, c.placeContentRepository),
  getFilterOptions: (c) => new GetFilterOptions(c.countryRepository),
  loadDiscoveryHistory: (c) => new LoadDiscoveryHistory(c.discoveryHistory),
  rememberSearch: (c) => new RememberSearch(c.discoveryHistory),
  forgetSearch: (c) => new ForgetSearch(c.discoveryHistory),
  clearSearchHistory: (c) => new ClearSearchHistory(c.discoveryHistory),
  recordDestinationView: (c) => new RecordDestinationView(c.discoveryHistory),
  clearRecentlyViewed: (c) => new ClearRecentlyViewed(c.discoveryHistory),
};
