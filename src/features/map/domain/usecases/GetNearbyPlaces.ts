import { type AppError } from '@/core/errors/AppError';
import { ok, type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';
import { type Coordinates } from '@/features/weather/domain/Coordinates';

import { checkCoordinates, distanceMeters, roundTo } from '../geo';
import { type Place } from '../Place';
import { type PlacesRepository } from '../repositories';

/** ~110 m: enough for a 1.5 km search, keeps the exact position on the device and lets nearby centres share a cache entry. */
export const NEARBY_CENTER_DECIMALS = 3;

export interface GetNearbyPlacesInput {
  readonly center: Coordinates;
  readonly signal?: AbortSignal;
}

/**
 * Validates the centre (`invalidLocation`, no request), rounds it to 3 decimals and
 * loads the places around it. Distances are then measured again from the exact
 * centre (which never leaves the device), nearest first, since the rounded one
 * can be up to ~80 m off.
 */
export class GetNearbyPlaces implements UseCase<GetNearbyPlacesInput, Result<readonly Place[], AppError>> {
  constructor(private readonly repository: PlacesRepository) {}

  async execute({ center, signal }: GetNearbyPlacesInput): Promise<Result<readonly Place[], AppError>> {
    const valid = checkCoordinates(center);
    if (!valid.ok) return valid;
    const exact = valid.value;
    const result = await this.repository.getNearby(roundTo(exact, NEARBY_CENTER_DECIMALS), signal);
    if (!result.ok) return result;
    return ok(
      result.value
        .map((place) => ({ ...place, distanceMeters: distanceMeters(exact, place.coordinates) }))
        .sort((a, b) => a.distanceMeters - b.distanceMeters),
    );
  }
}
