import { z } from 'zod';

import { type CacheStore } from '@/core/cache/CacheStore';
import {
  type CacheCodec,
  type CachedValue,
  PersistentCache,
  type PersistentCachePolicy,
} from '@/core/cache/PersistentCache';
import { type AppError } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { type ConnectivityService } from '@/core/network/ConnectivityService';
import { ok, type Result } from '@/core/result';
import { type Clock } from '@/core/utils/Clock';

import { type Country } from '../domain/Country';
import { type PlaceSearchHit, type PlaceSummary } from '../domain/Destination';
import { type CountryRepository, type PlaceContentRepository } from '../domain/repositories';

const DAY_MS = 24 * 60 * 60_000;

/**
 * Country facts change rarely (population a few times a year), so a downloaded copy
 * is used for a day without asking again, which also saves the REST Countries rate
 * limit (20 requests / 10 s). A copy up to 30 days old stands in when it can't be refreshed.
 */
export const COUNTRY_CACHE_POLICY: PersistentCachePolicy = {
  freshForMs: DAY_MS,
  maxStaleMs: 30 * DAY_MS,
  maxEntries: 300,
};

/** Wikipedia summaries: fresh for 3 days, shown offline for up to 30. About 400 articles fit in a few MB. */
export const SUMMARY_CACHE_POLICY: PersistentCachePolicy = {
  freshForMs: 3 * DAY_MS,
  maxStaleMs: 30 * DAY_MS,
  maxEntries: 400,
};

export const DISCOVER_CACHE_NAMESPACES = {
  catalogue: 'discover.countryCatalogue',
  country: 'discover.country',
  summary: 'discover.placeSummary',
} as const;

const coordinatesSchema = z.object({ latitude: z.number(), longitude: z.number() });

/** Stored data is untrusted like any other: it must describe a complete country to be shown. */
const countrySchema = z.object({
  code: z.string().regex(/^[A-Z]{2}$/),
  code3: z.string().nullable(),
  name: z.string().min(1),
  officialName: z.string().nullable(),
  alternateNames: z.array(z.string()),
  capitals: z.array(z.string()),
  region: z.string().nullable(),
  subregion: z.string().nullable(),
  population: z.number().nullable(),
  areaKm2: z.number().nullable(),
  languages: z.array(z.string()),
  currencies: z.array(z.object({ code: z.string(), name: z.string(), symbol: z.string().nullable() })),
  flag: z.object({
    pngUrl: z.string().nullable(),
    svgUrl: z.string().nullable(),
    emoji: z.string().nullable(),
    description: z.string().nullable(),
  }),
  coordinates: coordinatesSchema.nullable(),
  timezones: z.array(z.string()),
  borders: z.array(z.string()),
  callingCodes: z.array(z.string()),
  drivingSide: z.enum(['left', 'right']).nullable(),
  landlocked: z.boolean().nullable(),
  wikipediaTitle: z.string().nullable(),
});

const placeSummarySchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable(),
  extract: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  imageUrl: z.string().nullable(),
  articleUrl: z.string().nullable(),
  coordinates: coordinatesSchema.nullable(),
});

/** `savedAt` describes how a copy was served, so it is never stored. */
function withoutSavedAt<T extends { readonly savedAt?: number }>(value: T): Omit<T, 'savedAt'> {
  const { savedAt: _ignored, ...rest } = value;
  return rest;
}

export const countryCodec: CacheCodec<Country> = {
  encode: withoutSavedAt,
  decode: (raw) => {
    const parsed = countrySchema.safeParse(raw);
    return parsed.success ? { value: parsed.data } : null;
  },
};

/** One malformed country is dropped, not the whole catalogue; an empty result is a miss. */
export const catalogueCodec: CacheCodec<readonly Country[]> = {
  encode: (countries) => countries.map(withoutSavedAt),
  decode: (raw) => {
    if (!Array.isArray(raw)) return null;
    const countries = raw.flatMap((item) => countryCodec.decode(item)?.value ?? []);
    return countries.length > 0 ? { value: countries } : null;
  },
};

/** `null` ("no usable article") is cached too, so offline lookups of the next title candidate still work. */
export const summaryCodec: CacheCodec<PlaceSummary | null> = {
  encode: (summary) => ({ summary: summary ? withoutSavedAt(summary) : null }),
  decode: (raw) => {
    const parsed = z.object({ summary: placeSummarySchema.nullable() }).safeParse(raw);
    return parsed.success ? { value: parsed.data.summary } : null;
  },
};

/** Marks the value as a saved copy when it is standing in for a failed refresh. */
function unwrap<T, R>(
  result: Result<CachedValue<T>, AppError>,
  mark: (value: T, savedAt: number) => R,
  plain: (value: T) => R,
): Result<R, AppError> {
  if (!result.ok) return result;
  const { value, refreshError, storedAt } = result.value;
  return ok(refreshError === null ? plain(value) : mark(value, storedAt));
}

interface PersistentDependencies {
  readonly store: CacheStore;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly connectivity?: Pick<ConnectivityService, 'subscribe'>;
}

/**
 * Keeps the country catalogue and details on the device (Decorator over the remote
 * repository), so search, filters, the home feed and destination pages work offline
 * and after a restart with the last downloaded data. A copy shown because a refresh
 * failed carries `savedAt`.
 */
export class PersistentCountryRepository implements CountryRepository {
  private readonly catalogue: PersistentCache<readonly Country[]>;
  private readonly details: PersistentCache<Country>;

  constructor(
    private readonly remote: CountryRepository,
    deps: PersistentDependencies,
    policy: PersistentCachePolicy = COUNTRY_CACHE_POLICY,
  ) {
    this.catalogue = new PersistentCache({
      ...deps,
      namespace: DISCOVER_CACHE_NAMESPACES.catalogue,
      version: 1,
      codec: catalogueCodec,
      policy,
    });
    this.details = new PersistentCache({
      ...deps,
      namespace: DISCOVER_CACHE_NAMESPACES.country,
      version: 1,
      codec: countryCodec,
      policy,
    });
  }

  async getAll(signal?: AbortSignal): Promise<Result<readonly Country[], AppError>> {
    return unwrap(
      await this.catalogue.get('all', () => this.remote.getAll(signal)),
      (countries, savedAt) => countries.map((country) => ({ ...country, savedAt })),
      (countries) => countries,
    );
  }

  async getByCode(code: string, signal?: AbortSignal): Promise<Result<Country, AppError>> {
    const key = code.trim().toUpperCase();
    return unwrap(
      await this.details.get(key, () => this.remote.getByCode(key, signal)),
      (country, savedAt) => ({ ...country, savedAt }),
      (country) => country,
    );
  }
}

/**
 * Keeps Wikipedia summaries on the device. Title search is never stored: a stale
 * list of titles is worse than "search needs a connection".
 */
export class PersistentPlaceContentRepository implements PlaceContentRepository {
  private readonly summaries: PersistentCache<PlaceSummary | null>;

  constructor(
    private readonly remote: PlaceContentRepository,
    deps: PersistentDependencies,
    policy: PersistentCachePolicy = SUMMARY_CACHE_POLICY,
  ) {
    this.summaries = new PersistentCache({
      ...deps,
      namespace: DISCOVER_CACHE_NAMESPACES.summary,
      version: 1,
      codec: summaryCodec,
      policy,
    });
  }

  async getSummary(title: string, signal?: AbortSignal): Promise<Result<PlaceSummary | null, AppError>> {
    const key = title.trim();
    if (!key) return this.remote.getSummary(title, signal);
    return unwrap(
      await this.summaries.get(key, () => this.remote.getSummary(key, signal)),
      (summary, savedAt) => (summary ? { ...summary, savedAt } : null),
      (summary) => summary,
    );
  }

  searchTitles(
    query: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<Result<readonly PlaceSearchHit[], AppError>> {
    return this.remote.searchTitles(query, limit, signal);
  }
}

/** A saved copy shown for a failed refresh must not be kept in memory, or it would hide the next refresh. */
export const isCurrentCountryList = (countries: readonly Country[]) => countries.every((c) => c.savedAt === undefined);
export const isCurrentCountry = (country: Country) => country.savedAt === undefined;
export const isCurrentSummary = (summary: PlaceSummary | null) => summary?.savedAt === undefined;
