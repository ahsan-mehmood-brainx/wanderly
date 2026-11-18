import { type Coordinates } from '@/features/weather/domain/Coordinates';

import { NEARBY_RADIUS_M, type PlaceCategory } from '../domain/Place';

/**
 * Elements per category; 6 categories keep a response under 240 elements before mapping.
 * Overpass applies `out N` in element id order, not by distance: where a category has more
 * than N matches within the radius, the N returned are an arbitrary subset of the circle and
 * the closest ones can be missing. See ARCHITECTURE.md, Explore map, Request policy.
 */
const PER_CATEGORY_LIMIT = 40;
/** Server-side limit, so a busy Overpass instance gives up instead of holding the request. */
const SERVER_TIMEOUT_S = 25;

interface TagRule {
  readonly key: string;
  readonly values: readonly string[];
}

/** The OSM tags of each category, in classification precedence (first match wins). */
const CATEGORY_RULES: readonly { readonly category: PlaceCategory; readonly tags: readonly TagRule[] }[] = [
  { category: 'museums', tags: [{ key: 'tourism', values: ['museum', 'gallery'] }] },
  { category: 'hotels', tags: [{ key: 'tourism', values: ['hotel', 'hostel', 'guest_house', 'motel'] }] },
  { category: 'restaurants', tags: [{ key: 'amenity', values: ['restaurant', 'cafe', 'fast_food'] }] },
  { category: 'parks', tags: [{ key: 'leisure', values: ['park', 'garden', 'nature_reserve'] }] },
  {
    category: 'landmarks',
    tags: [
      { key: 'historic', values: ['monument', 'memorial', 'castle', 'ruins', 'archaeological_site', 'fort'] },
      { key: 'man_made', values: ['lighthouse'] },
    ],
  },
  { category: 'attractions', tags: [{ key: 'tourism', values: ['attraction', 'viewpoint', 'zoo', 'theme_park'] }] },
];

const statement = ({ key, values }: TagRule, around: string) =>
  `nwr["${key}"~"^(${values.join('|')})$"]["name"](${around});`;

/** Overpass QL for every category around an already rounded centre: one statement and `out center 40` per category. */
export function buildOverpassQuery(center: Coordinates): string {
  const around = `around:${NEARBY_RADIUS_M},${center.latitude},${center.longitude}`;
  const blocks = CATEGORY_RULES.map(({ tags }) => {
    const filter =
      tags.length === 1 && tags[0]
        ? statement(tags[0], around)
        : `(${tags.map((t) => statement(t, around)).join('')});`;
    return `${filter}out center ${PER_CATEGORY_LIMIT};`;
  });
  return `[out:json][timeout:${SERVER_TIMEOUT_S}];${blocks.join('')}`;
}

/** The category of an OSM element's tags (museum > hotel > restaurant > park > landmark > attraction), or `null`. */
export function categoryForTags(tags: Readonly<Record<string, string>>): PlaceCategory | null {
  const rule = CATEGORY_RULES.find((candidate) =>
    candidate.tags.some(({ key, values }) => {
      const value = tags[key];
      return value !== undefined && values.includes(value);
    }),
  );
  return rule?.category ?? null;
}
