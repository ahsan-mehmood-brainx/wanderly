import { type AppErrorKind } from '@/core/errors/AppError';

import { type Coordinates, type Country, type Currency } from './Country';

/**
 * Destination categories. Neither API classifies places for travellers, so
 * categories come from the editorial catalogue (`editorial.ts`) and, for
 * Wikipedia search results, from the place's short description.
 */
export const DESTINATION_CATEGORIES = ['city', 'beach', 'mountains', 'nature', 'culture', 'island'] as const;
export type DestinationCategory = (typeof DESTINATION_CATEGORIES)[number];

export function isDestinationCategory(value: unknown): value is DestinationCategory {
  return typeof value === 'string' && (DESTINATION_CATEGORIES as readonly string[]).includes(value);
}

/** `country`: from REST Countries. `city` and `place`: from Wikipedia or the editorial catalogue. */
export type DestinationKind = 'country' | 'city' | 'place';

/** What a search result, card or list row needs. Text is raw data; the UI composes translated labels. */
export interface DestinationSummary {
  /** Route id (see `DestinationId.ts`). */
  readonly id: string;
  readonly kind: DestinationKind;
  readonly name: string;
  /** Country the destination is in (itself, for a country). `null` when it couldn't be determined. */
  readonly countryCode: string | null;
  readonly countryName: string | null;
  readonly region: string | null;
  /** Short English description from Wikipedia, e.g. "City in the Kansai region of Japan". */
  readonly description: string | null;
  /** Flag for countries, photo thumbnail for places. `null` when none exists. */
  readonly imageUrl: string | null;
  readonly flagEmoji: string | null;
  readonly categories: readonly DestinationCategory[];
  /** True when this city is its country's capital. */
  readonly isCapital: boolean;
}

/** Saved when a destination's details are opened; enough to render the row without a request. */
export interface RecentDestination {
  readonly id: string;
  readonly kind: DestinationKind;
  readonly name: string;
  readonly countryCode: string | null;
  readonly countryName: string | null;
  readonly imageUrl: string | null;
  readonly flagEmoji: string | null;
  /** Epoch ms. */
  readonly viewedAt: number;
}

/** Wikipedia's article summary for a place or country. */
export interface PlaceSummary {
  /** Canonical article title (after redirects). */
  readonly title: string;
  readonly description: string | null;
  /** Plain-text lead paragraph. */
  readonly extract: string | null;
  readonly thumbnailUrl: string | null;
  /** Larger image for headers; falls back to the thumbnail. */
  readonly imageUrl: string | null;
  readonly articleUrl: string | null;
  readonly coordinates: Coordinates | null;
  /** As `Country.savedAt`: set only for a saved copy shown because a refresh failed. */
  readonly savedAt?: number;
}

/** One Wikipedia title-search hit, before it is classified as a destination (or discarded). */
export interface PlaceSearchHit {
  readonly title: string;
  readonly description: string | null;
  readonly thumbnailUrl: string | null;
}

/** Why a description is missing, so the UI can say "not available" vs "couldn't load". */
export type DescriptionState =
  | { readonly status: 'available'; readonly summary: PlaceSummary }
  | { readonly status: 'missing' }
  | { readonly status: 'failed'; readonly errorKind: AppErrorKind };

/** Practical facts shown under "Travel essentials", for a country or a place's host country. */
export interface TravelEssentials {
  readonly languages: readonly string[];
  readonly currencies: readonly Currency[];
  readonly timezones: readonly string[];
  readonly callingCodes: readonly string[];
  readonly drivingSide: 'left' | 'right' | null;
}

export interface Neighbour {
  readonly id: string;
  readonly name: string;
  readonly flagEmoji: string | null;
}

export interface CountryDestinationDetails {
  readonly kind: 'country';
  readonly id: string;
  readonly country: Country;
  readonly description: DescriptionState;
  readonly neighbours: readonly Neighbour[];
  readonly essentials: TravelEssentials;
  /** See {@link savedAtOf}. */
  readonly savedAt?: number;
}

export interface PlaceDestinationDetails {
  readonly kind: 'city' | 'place';
  readonly id: string;
  readonly name: string;
  readonly description: DescriptionState;
  readonly categories: readonly DestinationCategory[];
  /** Host country, when known. Its essentials double as the place's practical information. */
  readonly country: Country | null;
  readonly essentials: TravelEssentials | null;
  /** See {@link savedAtOf}. */
  readonly savedAt?: number;
}

export type DestinationDetails = CountryDestinationDetails | PlaceDestinationDetails;

/**
 * When some of a destination's information is a saved copy shown because it couldn't
 * be refreshed, the download time of the oldest such part; `undefined` when all of
 * it is current. The screen says so ("Saved information from 3 days ago").
 */
export function savedAtOf(country: Pick<Country, 'savedAt'> | null, description: DescriptionState): number | undefined {
  const times = [country?.savedAt, description.status === 'available' ? description.summary.savedAt : undefined];
  const known = times.filter((time): time is number => time !== undefined);
  return known.length > 0 ? Math.min(...known) : undefined;
}

export function essentialsOf(country: Country): TravelEssentials {
  return {
    languages: country.languages,
    currencies: country.currencies,
    timezones: country.timezones,
    callingCodes: country.callingCodes,
    drivingSide: country.drivingSide,
  };
}

export function toRecentDestination(details: DestinationDetails, viewedAt: number): RecentDestination {
  if (details.kind === 'country') {
    const { country } = details;
    return {
      id: details.id,
      kind: 'country',
      name: country.name,
      countryCode: country.code,
      countryName: country.name,
      imageUrl: country.flag.pngUrl,
      flagEmoji: country.flag.emoji,
      viewedAt,
    };
  }
  const summary = details.description.status === 'available' ? details.description.summary : null;
  return {
    id: details.id,
    kind: details.kind,
    name: details.name,
    countryCode: details.country?.code ?? null,
    countryName: details.country?.name ?? null,
    imageUrl: summary?.thumbnailUrl ?? null,
    flagEmoji: details.country?.flag.emoji ?? null,
    viewedAt,
  };
}

/** Where to get weather for a destination, and how precise that is. */
export interface DestinationWeatherPlace {
  readonly name: string;
  /** `null` when the sources don't say where the place is (some Wikipedia articles, some territories). */
  readonly coordinates: Coordinates | null;
  /**
   * Why the position couldn't be *loaded* (the place's Wikipedia summary failed:
   * offline, a server error…). Unlike a place with no known position, trying
   * again can help. `null` when nothing failed.
   */
  readonly coordinatesError: AppErrorKind | null;
  /**
   * `country`: the coordinates are the country's reference point (its rough centre), not a city,
   * so the UI says so. `place`: the place's own coordinates.
   */
  readonly precision: 'country' | 'place';
}

/** Countries use REST Countries' reference point; cities and places use their Wikipedia article's coordinates. */
export function destinationWeatherPlace(details: DestinationDetails): DestinationWeatherPlace {
  if (details.kind === 'country') {
    return {
      name: details.country.name,
      coordinates: details.country.coordinates,
      coordinatesError: null,
      precision: 'country',
    };
  }
  const { description } = details;
  return {
    name: details.name,
    coordinates: description.status === 'available' ? (description.summary.coordinates ?? null) : null,
    coordinatesError: description.status === 'failed' ? description.errorKind : null,
    precision: 'place',
  };
}
