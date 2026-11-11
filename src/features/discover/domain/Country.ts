export interface Currency {
  /** ISO 4217, upper case (`EUR`). */
  readonly code: string;
  readonly name: string;
  readonly symbol: string | null;
}

export interface CountryFlag {
  readonly pngUrl: string | null;
  readonly svgUrl: string | null;
  readonly emoji: string | null;
  /** Describes the flag for screen readers. `null` when the API has none. */
  readonly description: string | null;
}

export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * A country as Wanderly understands it. Every field the API might omit is
 * nullable or an empty list: the country APIs are incomplete for territories,
 * disputed areas and Antarctica, and the UI shows "Not available" rather than guessing.
 */
export interface Country {
  /** ISO 3166-1 alpha-2, upper case (`PT`). The only field guaranteed to be present. */
  readonly code: string;
  /** ISO 3166-1 alpha-3 (`PRT`), used by `borders`. */
  readonly code3: string | null;
  readonly name: string;
  readonly officialName: string | null;
  readonly alternateNames: readonly string[];
  /** Primary capital first. Some countries have several (South Africa), some none. */
  readonly capitals: readonly string[];
  readonly region: string | null;
  readonly subregion: string | null;
  readonly population: number | null;
  readonly areaKm2: number | null;
  /** English language names. */
  readonly languages: readonly string[];
  readonly currencies: readonly Currency[];
  readonly flag: CountryFlag;
  readonly coordinates: Coordinates | null;
  readonly timezones: readonly string[];
  /** Neighbours as alpha-3 codes. */
  readonly borders: readonly string[];
  readonly callingCodes: readonly string[];
  readonly drivingSide: 'left' | 'right' | null;
  readonly landlocked: boolean | null;
  /** Title of the country's English Wikipedia article, when the API links one ("Georgia (country)"). */
  readonly wikipediaTitle: string | null;
}

export const primaryCapital = (country: Pick<Country, 'capitals'>): string | null => country.capitals[0] ?? null;
