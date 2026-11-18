import { type Coordinates } from '@/features/weather/domain/Coordinates';

import { checkCoordinates, distanceMeters } from '../domain/geo';
import { type LocationSearchResult, type Place } from '../domain/Place';
import { type NominatimSearchDto, nominatimResultDtoSchema } from './dto/nominatimDtos';
import { type OverpassElementDto, overpassElementDtoSchema, type OverpassResponseDto } from './dto/overpassDtos';
import { categoryForTags } from './overpassQuery';

type Tags = Readonly<Record<string, string>>;

const text = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const joinNonEmpty = (parts: readonly (string | null)[], separator: string): string | null =>
  text(parts.filter((part): part is string => part !== null).join(separator));

function addressFrom(tags: Tags): string | null {
  const full = text(tags['addr:full']);
  if (full) return full;
  const street = joinNonEmpty([text(tags['addr:housenumber']), text(tags['addr:street'])], ' ');
  const locality = joinNonEmpty([text(tags['addr:postcode']), text(tags['addr:city'])], ' ');
  return joinNonEmpty([street, locality], ', ');
}

/** Only web links: a `javascript:` or `ftp:` value from OSM must never be opened. */
function websiteFrom(tags: Tags): string | null {
  const website = text(tags.website) ?? text(tags['contact:website']);
  return website && /^https?:\/\/\S+$/i.test(website) ? website : null;
}

function toPlace(element: OverpassElementDto, center: Coordinates): Place | null {
  const tags = element.tags ?? {};
  const name = text(tags.name);
  const category = categoryForTags(tags);
  if (!name || !category) return null;

  const point = element.type === 'node' ? { lat: element.lat, lon: element.lon } : element.center;
  const coordinates = checkCoordinates(point && { latitude: point.lat, longitude: point.lon });
  if (!coordinates.ok) return null;

  return {
    id: `osm:${element.type}/${element.id}`,
    name,
    category,
    coordinates: coordinates.value,
    distanceMeters: distanceMeters(center, coordinates.value),
    address: addressFrom(tags),
    openingHours: text(tags.opening_hours),
    website: websiteFrom(tags),
    phone: text(tags.phone) ?? text(tags['contact:phone']),
  };
}

/**
 * Places from an Overpass response: invalid elements dropped, duplicates merged, sorted by
 * distance from `center` (the rounded centre that was sent; `GetNearbyPlaces` re-measures
 * from the exact one).
 */
export function toPlaces(response: OverpassResponseDto, center: Coordinates): Place[] {
  const places = new Map<string, Place>();
  for (const raw of response.elements) {
    const parsed = overpassElementDtoSchema.safeParse(raw);
    if (!parsed.success) continue;
    const place = toPlace(parsed.data, center);
    // An element matching two category statements comes back twice.
    if (place && !places.has(place.id)) places.set(place.id, place);
  }
  return [...places.values()].sort((a, b) => a.distanceMeters - b.distanceMeters);
}

const toNumber = (value: string | number): number =>
  typeof value === 'number' ? value : value.trim() === '' ? Number.NaN : Number(value);

/** Geocoding hits from a Nominatim response; entries without a valid position are dropped. */
export function toLocationSearchResults(response: NominatimSearchDto): LocationSearchResult[] {
  const results: LocationSearchResult[] = [];
  for (const raw of response) {
    const parsed = nominatimResultDtoSchema.safeParse(raw);
    if (!parsed.success) continue;
    const dto = parsed.data;

    const coordinates = checkCoordinates({ latitude: toNumber(dto.lat), longitude: toNumber(dto.lon) });
    if (!coordinates.ok) continue;

    const parts = dto.display_name
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const name = text(dto.name) ?? parts[0];
    if (!name) continue;
    const rest = parts[0] === name ? parts.slice(1) : parts;

    results.push({
      id: `osm:${dto.osm_type}/${dto.osm_id}`,
      name,
      subtitle: rest.length > 0 ? rest.join(', ') : null,
      coordinates: coordinates.value,
    });
  }
  return results;
}
