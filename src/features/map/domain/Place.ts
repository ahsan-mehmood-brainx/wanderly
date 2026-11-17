import { type Coordinates } from '@/features/weather/domain/Coordinates';

export const PLACE_CATEGORIES = ['attractions', 'restaurants', 'hotels', 'museums', 'parks', 'landmarks'] as const;

export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

/** A point of interest near the map's centre (from OpenStreetMap). */
export interface Place {
  /** `osm:<node|way|relation>/<id>`. */
  readonly id: string;
  readonly name: string;
  readonly category: PlaceCategory;
  readonly coordinates: Coordinates;
  /**
   * Straight-line distance from the centre. The data layer measures from the rounded
   * centre it sent; `GetNearbyPlaces` measures again from the exact one.
   */
  readonly distanceMeters: number;
  readonly address: string | null;
  /** Raw OSM `opening_hours` value. */
  readonly openingHours: string | null;
  /** Only http/https URLs. */
  readonly website: string | null;
  readonly phone: string | null;
}

/** A geocoding hit the user can move the map to. */
export interface LocationSearchResult {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string | null;
  readonly coordinates: Coordinates;
}

/** A pin the user dropped on the map; unnamed and labelled by its coordinates. */
export interface CustomMarker {
  readonly id: string;
  readonly coordinates: Coordinates;
  readonly createdAt: number;
}

export const NEARBY_RADIUS_M = 1_500;
export const MAX_NEARBY_PLACES = 50;
export const MAX_CUSTOM_MARKERS = 50;
export const SEARCH_QUERY_MIN = 2;
export const SEARCH_QUERY_MAX = 200;
