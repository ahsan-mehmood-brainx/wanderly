import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';
import { type Coordinates } from '@/features/weather/domain/Coordinates';
import { type LocationPermission } from '@/features/weather/domain/repositories';

import { type CustomMarker, type LocationSearchResult, type Place } from './Place';

/** The device's position for the map (expo-location, foreground only). */
export interface LocationService {
  getPermission(): Promise<LocationPermission>;
  requestPermission(): Promise<LocationPermission>;
  /**
   * Fails with `locationPermissionDenied` without permission, `locationServicesDisabled`
   * when location services are off, `locationUnavailable` when no valid fix arrives in time,
   * and `cancelled` when aborted.
   */
  getCurrentPosition(signal?: AbortSignal): Promise<Result<Coordinates, AppError>>;
}

/** Geocoding (Nominatim) and nearby places (Overpass). */
export interface PlacesRepository {
  /** `language`: the app language, for localised names; results are cached per language. */
  searchLocations(
    query: string,
    signal?: AbortSignal,
    language?: string,
  ): Promise<Result<readonly LocationSearchResult[], AppError>>;
  /**
   * Places within {@link NEARBY_RADIUS_M} of an already validated, rounded centre, sorted by
   * distance. Each category is capped server side, and the cap keeps an arbitrary subset
   * (Overpass outputs in id order), so in a dense area the closest places can be missing.
   */
  getNearby(center: Coordinates, signal?: AbortSignal): Promise<Result<readonly Place[], AppError>>;
}

/** Pins saved on the device. */
export interface CustomMarkerRepository {
  load(): Promise<readonly CustomMarker[]>;
  save(markers: readonly CustomMarker[]): Promise<Result<void, AppError>>;
}
