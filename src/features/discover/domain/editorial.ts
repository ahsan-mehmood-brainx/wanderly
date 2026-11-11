import { type DestinationCategory } from './Destination';

/**
 * Editorial content. REST Countries knows nothing about tourism and Wikipedia
 * doesn't rank places, so featured and trending picks, and their categories, are
 * curated here like any travel product's editorial calendar. Each entry names a
 * Wikipedia article (checked to be a standard article, not a disambiguation
 * page); its photo and description are fetched at runtime.
 */
export interface CuratedDestination {
  /** Stable, URL-safe id, also used in deep links (`wanderly://destinations/kyoto`). */
  readonly slug: string;
  /** Exact English Wikipedia article title. */
  readonly wikipediaTitle: string;
  readonly name: string;
  /** ISO alpha-2 of the host country. */
  readonly countryCode: string;
  readonly kind: 'city' | 'place';
  readonly categories: readonly DestinationCategory[];
}

export const CURATED_DESTINATIONS: readonly CuratedDestination[] = [
  // Featured
  {
    slug: 'kyoto',
    wikipediaTitle: 'Kyoto',
    name: 'Kyoto',
    countryCode: 'JP',
    kind: 'city',
    categories: ['city', 'culture'],
  },
  {
    slug: 'santorini',
    wikipediaTitle: 'Santorini',
    name: 'Santorini',
    countryCode: 'GR',
    kind: 'place',
    categories: ['island', 'beach'],
  },
  {
    slug: 'banff-national-park',
    wikipediaTitle: 'Banff National Park',
    name: 'Banff National Park',
    countryCode: 'CA',
    kind: 'place',
    categories: ['mountains', 'nature'],
  },
  {
    slug: 'lisbon',
    wikipediaTitle: 'Lisbon',
    name: 'Lisbon',
    countryCode: 'PT',
    kind: 'city',
    categories: ['city', 'culture'],
  },
  {
    slug: 'machu-picchu',
    wikipediaTitle: 'Machu Picchu',
    name: 'Machu Picchu',
    countryCode: 'PE',
    kind: 'place',
    categories: ['culture', 'mountains'],
  },
  {
    slug: 'cape-town',
    wikipediaTitle: 'Cape Town',
    name: 'Cape Town',
    countryCode: 'ZA',
    kind: 'city',
    categories: ['city', 'beach'],
  },
  {
    slug: 'reykjavik',
    wikipediaTitle: 'Reykjavík',
    name: 'Reykjavík',
    countryCode: 'IS',
    kind: 'city',
    categories: ['city', 'nature'],
  },
  {
    slug: 'queenstown',
    wikipediaTitle: 'Queenstown, New Zealand',
    name: 'Queenstown',
    countryCode: 'NZ',
    kind: 'city',
    categories: ['mountains', 'nature'],
  },
  // Trending
  {
    slug: 'seoul',
    wikipediaTitle: 'Seoul',
    name: 'Seoul',
    countryCode: 'KR',
    kind: 'city',
    categories: ['city', 'culture'],
  },
  {
    slug: 'mexico-city',
    wikipediaTitle: 'Mexico City',
    name: 'Mexico City',
    countryCode: 'MX',
    kind: 'city',
    categories: ['city', 'culture'],
  },
  {
    slug: 'tbilisi',
    wikipediaTitle: 'Tbilisi',
    name: 'Tbilisi',
    countryCode: 'GE',
    kind: 'city',
    categories: ['city', 'culture'],
  },
  {
    slug: 'bali',
    wikipediaTitle: 'Bali',
    name: 'Bali',
    countryCode: 'ID',
    kind: 'place',
    categories: ['island', 'beach'],
  },
  {
    slug: 'porto',
    wikipediaTitle: 'Porto',
    name: 'Porto',
    countryCode: 'PT',
    kind: 'city',
    categories: ['city', 'culture'],
  },
  {
    slug: 'hanoi',
    wikipediaTitle: 'Hanoi',
    name: 'Hanoi',
    countryCode: 'VN',
    kind: 'city',
    categories: ['city', 'culture'],
  },
  {
    slug: 'dolomites',
    wikipediaTitle: 'Dolomites',
    name: 'Dolomites',
    countryCode: 'IT',
    kind: 'place',
    categories: ['mountains', 'nature'],
  },
  {
    slug: 'marrakesh',
    wikipediaTitle: 'Marrakesh',
    name: 'Marrakesh',
    countryCode: 'MA',
    kind: 'city',
    categories: ['city', 'culture'],
  },
  // Category picks
  {
    slug: 'zermatt',
    wikipediaTitle: 'Zermatt',
    name: 'Zermatt',
    countryCode: 'CH',
    kind: 'place',
    categories: ['mountains'],
  },
  {
    slug: 'amalfi-coast',
    wikipediaTitle: 'Amalfi Coast',
    name: 'Amalfi Coast',
    countryCode: 'IT',
    kind: 'place',
    categories: ['beach', 'culture'],
  },
  {
    slug: 'great-barrier-reef',
    wikipediaTitle: 'Great Barrier Reef',
    name: 'Great Barrier Reef',
    countryCode: 'AU',
    kind: 'place',
    categories: ['nature', 'beach'],
  },
  {
    slug: 'patagonia',
    wikipediaTitle: 'Patagonia',
    name: 'Patagonia',
    countryCode: 'AR',
    kind: 'place',
    categories: ['nature', 'mountains'],
  },
  { slug: 'petra', wikipediaTitle: 'Petra', name: 'Petra', countryCode: 'JO', kind: 'place', categories: ['culture'] },
  {
    slug: 'yosemite',
    wikipediaTitle: 'Yosemite National Park',
    name: 'Yosemite National Park',
    countryCode: 'US',
    kind: 'place',
    categories: ['nature', 'mountains'],
  },
  {
    slug: 'zanzibar',
    wikipediaTitle: 'Zanzibar',
    name: 'Zanzibar',
    countryCode: 'TZ',
    kind: 'place',
    categories: ['island', 'beach'],
  },
  {
    slug: 'ha-long-bay',
    wikipediaTitle: 'Hạ Long Bay',
    name: 'Hạ Long Bay',
    countryCode: 'VN',
    kind: 'place',
    categories: ['nature'],
  },
  {
    slug: 'plitvice-lakes',
    wikipediaTitle: 'Plitvice Lakes National Park',
    name: 'Plitvice Lakes',
    countryCode: 'HR',
    kind: 'place',
    categories: ['nature'],
  },
  {
    slug: 'bora-bora',
    wikipediaTitle: 'Bora Bora',
    name: 'Bora Bora',
    countryCode: 'PF',
    kind: 'place',
    categories: ['island', 'beach'],
  },
  {
    slug: 'cappadocia',
    wikipediaTitle: 'Cappadocia',
    name: 'Cappadocia',
    countryCode: 'TR',
    kind: 'place',
    categories: ['culture', 'nature'],
  },
  {
    slug: 'lofoten',
    wikipediaTitle: 'Lofoten',
    name: 'Lofoten',
    countryCode: 'NO',
    kind: 'place',
    categories: ['island', 'nature'],
  },
];

export const FEATURED_SLUGS: readonly string[] = [
  'kyoto',
  'santorini',
  'banff-national-park',
  'lisbon',
  'machu-picchu',
  'cape-town',
  'reykjavik',
  'queenstown',
];

export const TRENDING_SLUGS: readonly string[] = [
  'seoul',
  'mexico-city',
  'tbilisi',
  'bali',
  'porto',
  'hanoi',
  'dolomites',
  'marrakesh',
];

/** Most-visited countries (UN Tourism arrivals), as ISO alpha-2. Missing ones are skipped. */
export const POPULAR_COUNTRY_CODES: readonly string[] = [
  'FR',
  'ES',
  'US',
  'IT',
  'TR',
  'MX',
  'GB',
  'DE',
  'GR',
  'JP',
  'TH',
  'PT',
];

const BY_SLUG = new Map(CURATED_DESTINATIONS.map((destination) => [destination.slug, destination]));
const BY_TITLE = new Map(CURATED_DESTINATIONS.map((destination) => [destination.wikipediaTitle, destination]));

export const findCuratedBySlug = (slug: string): CuratedDestination | null => BY_SLUG.get(slug) ?? null;
export const findCuratedByTitle = (title: string): CuratedDestination | null => BY_TITLE.get(title) ?? null;

export function curatedBySlugs(slugs: readonly string[]): CuratedDestination[] {
  return slugs.flatMap((slug) => BY_SLUG.get(slug) ?? []);
}
