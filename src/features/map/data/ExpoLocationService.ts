import * as ExpoLocation from 'expo-location';

import { AppError } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { err, type Result } from '@/core/result';
import { TIMED_OUT, withTimeout } from '@/core/utils/async';
import { type Coordinates } from '@/features/weather/domain/Coordinates';
import { type LocationPermission } from '@/features/weather/domain/repositories';

import { checkCoordinates } from '../domain/geo';
import { type LocationService } from '../domain/repositories';

/** The parts of expo-location this adapter uses; injectable so it is tested without native modules. */
export type ExpoLocationApi = Pick<
  typeof ExpoLocation,
  | 'getForegroundPermissionsAsync'
  | 'requestForegroundPermissionsAsync'
  | 'hasServicesEnabledAsync'
  | 'getLastKnownPositionAsync'
  | 'getCurrentPositionAsync'
>;

export interface MapLocationOptions {
  /** A cached fix up to this old returns instantly. */
  readonly lastKnownMaxAgeMs: number;
  /** The map shows places 1.5 km around the user, so a cached fix must be street-level. */
  readonly lastKnownRequiredAccuracyM: number;
  /** A fresh fix can take long indoors; after this, the position is "unavailable". */
  readonly timeoutMs: number;
}

export const DEFAULT_MAP_LOCATION_OPTIONS: MapLocationOptions = {
  lastKnownMaxAgeMs: 2 * 60_000,
  lastKnownRequiredAccuracyM: 100,
  timeoutMs: 15_000,
};

const cancelled = () => new AppError('cancelled', 'Locating was cancelled');
const unavailable = (message: string, cause?: unknown) => new AppError('locationUnavailable', message, { cause });

function toPermission(response: ExpoLocation.LocationPermissionResponse): LocationPermission {
  if (response.granted) return 'granted';
  if (response.status === ExpoLocation.PermissionStatus.UNDETERMINED) return 'undetermined';
  return response.canAskAgain ? 'denied' : 'blocked';
}

function toCoordinates({ coords }: ExpoLocation.LocationObject): Result<Coordinates, AppError> {
  // A platform can report garbage (0,0 from a mock provider, NaN); treat it as no fix.
  const valid = checkCoordinates({ latitude: coords.latitude, longitude: coords.longitude });
  return valid.ok ? valid : err(unavailable('The device reported an invalid position'));
}

/** {@link LocationService} over expo-location for the map (foreground, Balanced accuracy, full precision). */
export class ExpoLocationService implements LocationService {
  constructor(
    private readonly logger: Logger,
    private readonly api: ExpoLocationApi = ExpoLocation,
    private readonly options: MapLocationOptions = DEFAULT_MAP_LOCATION_OPTIONS,
  ) {}

  async getPermission(): Promise<LocationPermission> {
    try {
      return toPermission(await this.api.getForegroundPermissionsAsync());
    } catch (error) {
      this.logger.warn('Could not read the location permission', { error });
      return 'denied';
    }
  }

  async requestPermission(): Promise<LocationPermission> {
    try {
      return toPermission(await this.api.requestForegroundPermissionsAsync());
    } catch (error) {
      this.logger.warn('Could not request the location permission', { error });
      return 'denied';
    }
  }

  async getCurrentPosition(signal?: AbortSignal): Promise<Result<Coordinates, AppError>> {
    if (signal?.aborted) return err(cancelled());
    if ((await this.getPermission()) !== 'granted') {
      return err(new AppError('locationPermissionDenied', 'Location permission not granted'));
    }

    const servicesOn = await this.api.hasServicesEnabledAsync().catch(() => false);
    if (!servicesOn) return err(new AppError('locationServicesDisabled', 'Location services are turned off'));
    if (signal?.aborted) return err(cancelled());

    const { lastKnownMaxAgeMs, lastKnownRequiredAccuracyM, timeoutMs } = this.options;
    const lastKnown = await this.api
      .getLastKnownPositionAsync({ maxAge: lastKnownMaxAgeMs, requiredAccuracy: lastKnownRequiredAccuracyM })
      .catch(() => null);
    if (signal?.aborted) return err(cancelled());
    if (lastKnown) return toCoordinates(lastKnown);

    try {
      const position = await withTimeout(
        this.api.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced }),
        timeoutMs,
      );
      if (signal?.aborted) return err(cancelled());
      if (position === TIMED_OUT) return err(unavailable(`No position within ${timeoutMs} ms`));
      return toCoordinates(position);
    } catch (error) {
      this.logger.warn('Could not determine the device position', { error });
      return err(unavailable('Could not determine the device position', error));
    }
  }
}
