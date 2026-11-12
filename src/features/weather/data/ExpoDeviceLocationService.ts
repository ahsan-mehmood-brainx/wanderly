import * as ExpoLocation from 'expo-location';

import { AppError } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { err, ok, type Result } from '@/core/result';
import { TIMED_OUT, withTimeout } from '@/core/utils/async';

import { type Coordinates } from '../domain/Coordinates';
import { type DeviceLocationService, type LocationPermission } from '../domain/repositories';

/** The parts of expo-location this adapter uses; injectable so it is tested without native modules. */
export type ExpoLocationApi = Pick<
  typeof ExpoLocation,
  | 'getForegroundPermissionsAsync'
  | 'requestForegroundPermissionsAsync'
  | 'hasServicesEnabledAsync'
  | 'getLastKnownPositionAsync'
  | 'getCurrentPositionAsync'
>;

export interface DeviceLocationOptions {
  /** A cached fix up to this old is good enough for weather and returns instantly. */
  readonly lastKnownMaxAgeMs: number;
  /** Weather needs ~1 km; a coarser fix is faster and kinder to the battery. */
  readonly lastKnownRequiredAccuracyM: number;
  /** A fresh fix can take long indoors; after this, the position is "unavailable". */
  readonly timeoutMs: number;
}

export const DEFAULT_DEVICE_LOCATION_OPTIONS: DeviceLocationOptions = {
  lastKnownMaxAgeMs: 10 * 60_000,
  lastKnownRequiredAccuracyM: 5_000,
  timeoutMs: 15_000,
};

const cancelled = () => new AppError('cancelled', 'Locating was cancelled');
const unavailable = (message: string, cause?: unknown) => new AppError('locationUnavailable', message, { cause });

function toPermission(response: ExpoLocation.LocationPermissionResponse): LocationPermission {
  if (response.granted) return 'granted';
  if (response.status === ExpoLocation.PermissionStatus.UNDETERMINED) return 'undetermined';
  return response.canAskAgain ? 'denied' : 'blocked';
}

/** {@link DeviceLocationService} over expo-location (foreground, "when in use" only). */
export class ExpoDeviceLocationService implements DeviceLocationService {
  constructor(
    private readonly logger: Logger,
    private readonly api: ExpoLocationApi = ExpoLocation,
    private readonly options: DeviceLocationOptions = DEFAULT_DEVICE_LOCATION_OPTIONS,
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
    if (!servicesOn) return err(unavailable('Location services are turned off'));
    if (signal?.aborted) return err(cancelled());

    const { lastKnownMaxAgeMs, lastKnownRequiredAccuracyM, timeoutMs } = this.options;
    const lastKnown = await this.api
      .getLastKnownPositionAsync({ maxAge: lastKnownMaxAgeMs, requiredAccuracy: lastKnownRequiredAccuracyM })
      .catch(() => null);
    if (lastKnown) return ok(toCoordinates(lastKnown));

    try {
      const position = await withTimeout(
        this.api.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Low }),
        timeoutMs,
      );
      if (signal?.aborted) return err(cancelled());
      if (position === TIMED_OUT) return err(unavailable(`No position within ${timeoutMs} ms`));
      return ok(toCoordinates(position));
    } catch (error) {
      this.logger.warn('Could not determine the device position', { error });
      return err(unavailable('Could not determine the device position', error));
    }
  }
}

const toCoordinates = ({ coords }: ExpoLocation.LocationObject): Coordinates => ({
  latitude: coords.latitude,
  longitude: coords.longitude,
});
