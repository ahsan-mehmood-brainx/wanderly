import { type Country, type Currency } from './Country';
import { type DestinationCategory, type DestinationSummary } from './Destination';

/** Bounds are inclusive; `null` means unbounded. */
export interface PopulationRange {
  readonly min: number | null;
  readonly max: number | null;
}

/**
 * Search filters. Country, region, currency and population describe the country a
 * result belongs to (a city inherits its country's region); category describes the
 * destination itself. A filter that is `null` is off.
 */
export interface SearchFilters {
  /** ISO alpha-2. */
  readonly countryCode: string | null;
  readonly region: string | null;
  /** ISO 4217. */
  readonly currencyCode: string | null;
  readonly population: PopulationRange | null;
  readonly category: DestinationCategory | null;
}

export const NO_FILTERS: SearchFilters = {
  countryCode: null,
  region: null,
  currencyCode: null,
  population: null,
  category: null,
};

/** Preset population bands; a picker of ranges is easier to use (and to make accessible) than a slider. */
export const POPULATION_RANGES = {
  under1m: { min: null, max: 999_999 },
  from1mTo10m: { min: 1_000_000, max: 9_999_999 },
  from10mTo50m: { min: 10_000_000, max: 49_999_999 },
  from50mTo100m: { min: 50_000_000, max: 99_999_999 },
  over100m: { min: 100_000_000, max: null },
} as const satisfies Record<string, PopulationRange>;

export type PopulationRangeId = keyof typeof POPULATION_RANGES;

export function populationRangeId(range: PopulationRange | null): PopulationRangeId | null {
  if (!range) return null;
  const entry = Object.entries(POPULATION_RANGES).find(
    ([, preset]) => preset.min === range.min && preset.max === range.max,
  );
  return (entry?.[0] as PopulationRangeId | undefined) ?? null;
}

export function countActiveFilters(filters: SearchFilters): number {
  return Object.values(filters).filter((value) => value !== null).length;
}

export const hasActiveFilters = (filters: SearchFilters): boolean => countActiveFilters(filters) > 0;

export function isWithinPopulation(population: number | null, range: PopulationRange): boolean {
  if (population === null) return false;
  return (range.min === null || population >= range.min) && (range.max === null || population <= range.max);
}

/** The country-level filters a country satisfies. Unknown values never match an active filter. */
export function countryMatchesFilters(country: Country | null, filters: SearchFilters): boolean {
  const { countryCode, region, currencyCode, population } = filters;
  if (countryCode === null && region === null && currencyCode === null && population === null) return true;
  if (!country) return false;
  if (countryCode !== null && country.code !== countryCode) return false;
  if (region !== null && country.region !== region) return false;
  if (currencyCode !== null && !country.currencies.some((currency) => currency.code === currencyCode)) return false;
  if (population !== null && !isWithinPopulation(country.population, population)) return false;
  return true;
}

/**
 * Applies every filter to destinations. `countriesByCode` resolves each result's
 * country, so cities and places are filtered by where they are. A place whose
 * country is unknown can't satisfy a country-level filter and is dropped.
 * Countries have no category, so an active category filter leaves only places.
 */
export function applyFilters(
  destinations: readonly DestinationSummary[],
  filters: SearchFilters,
  countriesByCode: ReadonlyMap<string, Country>,
): DestinationSummary[] {
  return destinations.filter((destination) => {
    if (filters.category !== null && !destination.categories.includes(filters.category)) return false;
    const country = destination.countryCode ? (countriesByCode.get(destination.countryCode) ?? null) : null;
    return countryMatchesFilters(country, filters);
  });
}

export interface CountryOption {
  readonly code: string;
  readonly name: string;
  readonly flagEmoji: string | null;
}

/** Choices for the filter sheet, derived from the catalogue so they always match the data being filtered. */
export interface FilterOptions {
  readonly regions: readonly string[];
  readonly countries: readonly CountryOption[];
  readonly currencies: readonly Currency[];
}

export function buildFilterOptions(countries: readonly Country[]): FilterOptions {
  const regions = new Set<string>();
  const currencies = new Map<string, Currency>();
  for (const country of countries) {
    if (country.region) regions.add(country.region);
    for (const currency of country.currencies)
      if (!currencies.has(currency.code)) currencies.set(currency.code, currency);
  }
  const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
  return {
    regions: [...regions].sort((a, b) => a.localeCompare(b)),
    countries: countries
      .map((country) => ({ code: country.code, name: country.name, flagEmoji: country.flag.emoji }))
      .sort(byName),
    currencies: [...currencies.values()].sort(byName),
  };
}
