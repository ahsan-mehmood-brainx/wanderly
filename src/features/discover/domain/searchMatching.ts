import { type Country } from './Country';
import {
  type DestinationCategory,
  type DestinationKind,
  type DestinationSummary,
  type PlaceSearchHit,
} from './Destination';
import { countryDestinationId, placeDestinationId } from './DestinationId';
import { type CuratedDestination } from './editorial';

/** Case-, accent- and punctuation-insensitive form used for matching ("São Tomé" → "sao tome"). */
export function normalizeText(text: string): string {
  const decomposed = typeof text.normalize === 'function' ? text.normalize('NFD') : text;
  return (
    decomposed
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      // Punctuation and separators become spaces; letters in any script are kept.
      .replace(/[\s\-_'’‘"“”`.,;:!?()[\]{}/\\&+*|]+/g, ' ')
      .trim()
  );
}

/** Trims and collapses whitespace; what the user meant to type. */
export function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ');
}

/**
 * Scores how well `candidate` matches an already-normalised query, 0 meaning no match.
 * Exact > prefix > word prefix > substring, so "ice" ranks Iceland above Venice.
 */
export function matchScore(normalizedQuery: string, candidate: string | null | undefined): number {
  if (!candidate || !normalizedQuery) return 0;
  const text = normalizeText(candidate);
  if (text === normalizedQuery) return 100;
  if (text.startsWith(normalizedQuery)) return 80;
  if (text.split(' ').some((word) => word.startsWith(normalizedQuery))) return 60;
  if (normalizedQuery.length >= 3 && text.includes(normalizedQuery)) return 40;
  return 0;
}

export interface ScoredDestination {
  readonly destination: DestinationSummary;
  readonly score: number;
}

export function countryToSummary(country: Country): DestinationSummary {
  return {
    id: countryDestinationId(country.code),
    kind: 'country',
    name: country.name,
    countryCode: country.code,
    countryName: country.name,
    region: country.region,
    description: null,
    imageUrl: country.flag.pngUrl,
    flagEmoji: country.flag.emoji,
    categories: [],
    isCapital: false,
  };
}

export function capitalToSummary(capital: string, country: Country): DestinationSummary {
  return {
    id: placeDestinationId(capital, country.code),
    kind: 'city',
    name: capital,
    countryCode: country.code,
    countryName: country.name,
    region: country.region,
    description: null,
    imageUrl: null,
    flagEmoji: country.flag.emoji,
    categories: ['city'],
    isCapital: true,
  };
}

export function curatedToSummary(curated: CuratedDestination, country: Country | null): DestinationSummary {
  return {
    id: curated.slug,
    kind: curated.kind,
    name: curated.name,
    countryCode: curated.countryCode,
    countryName: country?.name ?? null,
    region: country?.region ?? null,
    description: null,
    imageUrl: null,
    flagEmoji: country?.flag.emoji ?? null,
    categories: curated.categories,
    isCapital: false,
  };
}

/** Countries and their capitals that match the query, from the locally cached catalogue. */
export function matchCountriesAndCapitals(normalizedQuery: string, countries: readonly Country[]): ScoredDestination[] {
  const matches: ScoredDestination[] = [];
  for (const country of countries) {
    const nameScore = Math.max(
      matchScore(normalizedQuery, country.name),
      matchScore(normalizedQuery, country.officialName) - 5,
      ...country.alternateNames.map((name) => matchScore(normalizedQuery, name) - 10),
      // "pt", "prt": only exact code matches count, or every two-letter query would match.
      normalizedQuery === country.code.toLowerCase() || normalizedQuery === country.code3?.toLowerCase() ? 70 : 0,
    );
    if (nameScore > 0) matches.push({ destination: countryToSummary(country), score: nameScore });

    for (const capital of country.capitals) {
      const capitalScore = matchScore(normalizedQuery, capital);
      // A capital slightly outranks its own country only on an exact name match ("Mexico City").
      if (capitalScore > 0) matches.push({ destination: capitalToSummary(capital, country), score: capitalScore - 2 });
    }
  }
  return matches;
}

export function matchCurated(
  normalizedQuery: string,
  curated: readonly CuratedDestination[],
  countriesByCode: ReadonlyMap<string, Country>,
): ScoredDestination[] {
  return curated.flatMap((destination) => {
    const score = Math.max(
      matchScore(normalizedQuery, destination.name),
      matchScore(normalizedQuery, destination.wikipediaTitle),
    );
    return score > 0
      ? [{ destination: curatedToSummary(destination, countriesByCode.get(destination.countryCode) ?? null), score }]
      : [];
  });
}

// ─── Wikipedia hits ─────────────────────────────────────────────────────────

const CITY_WORDS = /\b(city|town|capital|village|municipality|metropolis|commune|port|suburb|borough)\b/i;
const PLACE_WORDS =
  /\b(city|town|capital|village|municipality|metropolis|commune|port|island|islands|archipelago|atoll|region|province|state|county|prefecture|district|area|mountain|mountains|range|volcano|national park|park|beach|bay|coast|lake|river|valley|desert|waterfall|reef|peninsula|resort|temple|castle|palace|cathedral|monument|citadel|ruins|old town|historic|world heritage|landmark|place)\b/i;
/** Descriptions of things that merely share a place's name. */
const NON_PLACE_WORDS =
  /\b(film|album|song|single|band|football|club|team|protocol|treaty|novel|book|company|corporation|video game|game|episode|tv series|television|series|magazine|newspaper|ship|aircraft|politician|singer|actor|actress|player|footballer|musician|rapper|disambiguation|surname|given name|genus|species|software|university|airline|brand|journal|battle|war|election)\b/i;

const CATEGORY_RULES: readonly [DestinationCategory, RegExp][] = [
  ['city', CITY_WORDS],
  ['beach', /\b(beach|coast|coastal|riviera|seaside)\b/i],
  ['island', /\b(island|islands|archipelago|atoll)\b/i],
  ['mountains', /\b(mountain|mountains|range|volcano|alps|peak|massif)\b/i],
  ['nature', /\b(national park|park|lake|waterfall|valley|forest|desert|reef|glacier|canyon|bay|nature reserve)\b/i],
  [
    'culture',
    /\b(temple|castle|palace|cathedral|monument|citadel|ruins|historic|historical|old town|ancient|heritage)\b/i,
  ],
];

/** True when a Wikipedia hit's short description reads like a destination. Hits without a description are dropped. */
export function isPlaceDescription(description: string | null): boolean {
  if (!description) return false;
  return PLACE_WORDS.test(description) && !NON_PLACE_WORDS.test(description);
}

export function categoriesFromDescription(description: string | null): DestinationCategory[] {
  if (!description) return [];
  return CATEGORY_RULES.filter(([, pattern]) => pattern.test(description)).map(([category]) => category);
}

/**
 * Best-effort host country from a description such as "City in the Kansai region of Japan".
 * The longest country name found wins, so "Guinea-Bissau" beats "Guinea" and
 * "South Sudan" beats "Sudan". Returns `null` rather than guessing between equals.
 */
export function inferCountry(description: string | null, countries: readonly Country[]): Country | null {
  if (!description) return null;
  const text = ` ${normalizeText(description)} `;
  let best: Country | null = null;
  let bestLength = 0;
  let tie = false;
  for (const country of countries) {
    for (const name of [country.name, ...country.alternateNames]) {
      const normalized = normalizeText(name);
      if (normalized.length < 4 || !text.includes(` ${normalized} `)) continue;
      if (normalized.length > bestLength) {
        best = country;
        bestLength = normalized.length;
        tie = false;
      } else if (normalized.length === bestLength && best !== country) {
        tie = true;
      }
    }
  }
  return tie ? null : best;
}

/** Turns a Wikipedia search hit into a destination, or `null` when it isn't a place. */
export function placeHitToSummary(
  hit: PlaceSearchHit,
  countries: readonly Country[],
  rank: number,
): ScoredDestination | null {
  if (!isPlaceDescription(hit.description)) return null;
  const country = inferCountry(hit.description, countries);
  const categories = categoriesFromDescription(hit.description);
  const kind: DestinationKind = categories.includes('city') ? 'city' : 'place';
  return {
    destination: {
      id: placeDestinationId(hit.title, country?.code ?? null),
      kind,
      name: hit.title,
      countryCode: country?.code ?? null,
      countryName: country?.name ?? null,
      region: country?.region ?? null,
      description: hit.description,
      imageUrl: hit.thumbnailUrl,
      flagEmoji: country?.flag.emoji ?? null,
      categories,
      isCapital: false,
    },
    // Wikipedia orders by relevance; keep that order but below strong local matches.
    score: Math.max(1, 50 - rank * 3),
  };
}

/** Same destination found twice (e.g. "Lisbon" as a capital and as a Wikipedia hit)? */
const dedupeKey = (destination: DestinationSummary): string =>
  `${destination.kind === 'country' ? 'country' : 'place'}:${normalizeText(destination.name)}:${destination.countryCode ?? ''}`;

/**
 * Merges scored results, keeping the best-scoring copy of each destination
 * (earlier sources win ties: catalogue before curated before Wikipedia), then
 * sorts by score and name.
 */
export function rankResults(...sources: readonly (readonly ScoredDestination[])[]): DestinationSummary[] {
  const best = new Map<string, ScoredDestination>();
  for (const source of sources) {
    for (const entry of source) {
      const key = dedupeKey(entry.destination);
      const existing = best.get(key);
      if (!existing) {
        best.set(key, entry);
      } else if (entry.score > existing.score) {
        best.set(key, { destination: mergeDetails(entry.destination, existing.destination), score: entry.score });
      } else {
        best.set(key, { destination: mergeDetails(existing.destination, entry.destination), score: existing.score });
      }
    }
  }
  // A Wikipedia hit whose country is unknown duplicates a known one with the same name.
  const knownPlaces = new Set(
    [...best.values()]
      .filter(({ destination }) => destination.countryCode !== null)
      .map(({ destination }) => normalizeText(destination.name)),
  );
  return [...best.values()]
    .filter(({ destination }) => destination.countryCode !== null || !knownPlaces.has(normalizeText(destination.name)))
    .sort((a, b) => b.score - a.score || a.destination.name.localeCompare(b.destination.name))
    .map(({ destination }) => destination);
}

/** Keeps `primary`, filling gaps (photo, description, categories, capital status) from `secondary`. */
function mergeDetails(primary: DestinationSummary, secondary: DestinationSummary): DestinationSummary {
  return {
    ...primary,
    description: primary.description ?? secondary.description,
    imageUrl: primary.imageUrl ?? secondary.imageUrl,
    categories: [...new Set([...primary.categories, ...secondary.categories])],
    isCapital: primary.isCapital || secondary.isCapital,
  };
}
