import { type DestinationDetails } from '@/features/discover/domain/Destination';
import { countryDestinationId } from '@/features/discover/domain/DestinationId';
import { type Place } from '@/features/map/domain/Place';

export const FAVORITE_CATEGORIES = ['destination', 'country', 'attraction', 'restaurant', 'landmark'] as const;
export type FavoriteCategory = (typeof FAVORITE_CATEGORIES)[number];

/**
 * What is saved: a snapshot of the destination or map place taken when it was
 * saved, so Saved Places renders offline. `targetId` is the destination route id
 * (`country-pt`, a curated slug, `place-…`) or the map place id (`osm:node/…`);
 * an account saves each target at most once.
 */
export interface FavoriteTarget {
  readonly targetId: string;
  readonly category: FavoriteCategory;
  readonly name: string;
  /** Country (for destinations) or address (for map places). */
  readonly subtitle: string | null;
  readonly imageUrl: string | null;
  readonly flagEmoji: string | null;
  /** Both or neither. */
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly address: string | null;
}

export interface Favorite extends FavoriteTarget {
  readonly id: string;
  /** Epoch ms. */
  readonly savedAt: number;
}

/** Newest first. */
export function compareFavorites(a: Favorite, b: Favorite): number {
  return b.savedAt - a.savedAt || a.id.localeCompare(b.id);
}

/**
 * Countries are saved as `country`; cities and places as `destination`. A country
 * is saved under its canonical id (`country-pt`), since links may spell the code
 * in any case (`country-PT`) and it must still be one saved record.
 */
export function favoriteTargetFromDestination(details: DestinationDetails): FavoriteTarget {
  if (details.kind === 'country') {
    const { country } = details;
    return {
      targetId: countryDestinationId(country.code),
      category: 'country',
      name: country.name,
      subtitle: country.region,
      imageUrl: country.flag.pngUrl,
      flagEmoji: country.flag.emoji,
      latitude: country.coordinates?.latitude ?? null,
      longitude: country.coordinates?.longitude ?? null,
      address: null,
    };
  }
  const summary = details.description.status === 'available' ? details.description.summary : null;
  const coordinates = summary?.coordinates ?? null;
  return {
    targetId: details.id,
    category: 'destination',
    name: details.name,
    subtitle: details.country?.name ?? null,
    imageUrl: summary?.thumbnailUrl ?? summary?.imageUrl ?? null,
    flagEmoji: details.country?.flag.emoji ?? null,
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
    address: null,
  };
}

const PLACE_FAVORITE_CATEGORY: Record<Place['category'], FavoriteCategory | null> = {
  attractions: 'attraction',
  museums: 'attraction',
  parks: 'attraction',
  restaurants: 'restaurant',
  landmarks: 'landmark',
  hotels: null,
};

/**
 * Attractions, museums and parks are saved as `attraction`, restaurants as
 * `restaurant` and landmarks as `landmark`. Hotels can't be saved (`null`).
 */
export function favoriteTargetFromPlace(place: Place): FavoriteTarget | null {
  const category = PLACE_FAVORITE_CATEGORY[place.category];
  if (category === null) return null;
  return {
    targetId: place.id,
    category,
    name: place.name,
    subtitle: place.address,
    imageUrl: null,
    flagEmoji: null,
    latitude: place.coordinates.latitude,
    longitude: place.coordinates.longitude,
    address: place.address,
  };
}
