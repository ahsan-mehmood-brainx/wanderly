import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';
import { type Coordinates } from '@/features/weather/domain/Coordinates';

const EARTH_RADIUS_M = 6_371_008.8;

/** Finite, in range and not exactly 0,0; `invalidLocation` otherwise. Never rounds. */
export function checkCoordinates(location: Partial<Coordinates> | null | undefined): Result<Coordinates, AppError> {
  const latitude = location?.latitude;
  const longitude = location?.longitude;
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
  // 0,0 ("Null Island") is what a missing value defaulted to zero looks like.
  if (latitude === 0 && longitude === 0) {
    return err(new AppError('invalidLocation', 'Coordinates 0,0 are treated as missing'));
  }
  return ok({ latitude, longitude });
}

const roundValue = (value: number, factor: number): number => {
  const rounded = Math.round(value * factor) / factor;
  // Avoid -0, which would make "-0.000" and "0.000" different cache keys.
  return rounded === 0 ? 0 : rounded;
};

export function roundTo({ latitude, longitude }: Coordinates, decimals: number): Coordinates {
  const factor = 10 ** decimals;
  return { latitude: roundValue(latitude, factor), longitude: roundValue(longitude, factor) };
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle (haversine) distance in metres. */
export function distanceMeters(from: Coordinates, to: Coordinates): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Label for an unnamed pin: its coordinates to 5 decimals. */
export function formatPinLabel({ latitude, longitude }: Coordinates): string {
  return `${toFixedNoNegativeZero(latitude, 5)}, ${toFixedNoNegativeZero(longitude, 5)}`;
}

/** `toFixed`, but a value that rounds to zero never shows as "-0.00000". */
function toFixedNoNegativeZero(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals);
  return Number(fixed) === 0 ? Math.abs(Number(fixed)).toFixed(decimals) : fixed;
}
