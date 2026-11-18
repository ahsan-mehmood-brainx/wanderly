import { MAX_NEARBY_PLACES, type Place, type PlaceCategory } from './Place';

/**
 * The {@link MAX_NEARBY_PLACES} nearest of the loaded places among the selected categories,
 * nearest first. The loaded places can be a capped subset (see `PlacesRepository.getNearby`).
 */
export function filterPlaces(places: readonly Place[], categories: readonly PlaceCategory[]): Place[] {
  if (categories.length === 0) return [];
  const selected = new Set(categories);
  return places
    .filter((place) => selected.has(place.category))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, MAX_NEARBY_PLACES);
}
