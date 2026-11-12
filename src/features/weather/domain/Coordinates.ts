import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';

/** A point on Earth in decimal degrees (WGS 84). */
export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * Weather models have a resolution of 1–11 km, so two decimals (~1.1 km) lose
 * nothing. Rounding also lets nearby requests share one cache entry, and keeps a
 * precise device position from leaving the device.
 */
export const COORDINATE_DECIMALS = 2;

const FACTOR = 10 ** COORDINATE_DECIMALS;

const round = (value: number): number => {
  const rounded = Math.round(value * FACTOR) / FACTOR;
  // Avoid -0, which would make "-0.00" and "0.00" different cache keys.
  return rounded === 0 ? 0 : rounded;
};

export function roundCoordinates({ latitude, longitude }: Coordinates): Coordinates {
  return { latitude: round(latitude), longitude: round(longitude) };
}

/**
 * Checks that a position can be sent to a weather service and rounds it.
 *
 * - `null`/`undefined` (the place has no known position) → `locationUnavailable`.
 * - Non-numbers, `NaN`, infinities, or values out of range → `invalidLocation`.
 * - Exactly 0,0 ("Null Island", in the Gulf of Guinea) → `invalidLocation`: no
 *   destination is there, and it is what a missing value defaulted to zero looks like.
 */
export function validateCoordinates(location: Partial<Coordinates> | null | undefined): Result<Coordinates, AppError> {
  if (location === null || location === undefined) {
    return err(new AppError('locationUnavailable', 'No coordinates for this location'));
  }
  const { latitude, longitude } = location;
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return err(new AppError('invalidLocation', 'Coordinates are not a valid position'));
  }
  if (latitude === 0 && longitude === 0) {
    return err(new AppError('invalidLocation', 'Coordinates 0,0 are treated as missing'));
  }
  return ok(roundCoordinates({ latitude, longitude }));
}

/** Stable key for caches: the rounded coordinates, e.g. `38.72,-9.14`. */
export function coordinatesKey(location: Coordinates): string {
  const { latitude, longitude } = roundCoordinates(location);
  return `${latitude.toFixed(COORDINATE_DECIMALS)},${longitude.toFixed(COORDINATE_DECIMALS)}`;
}
