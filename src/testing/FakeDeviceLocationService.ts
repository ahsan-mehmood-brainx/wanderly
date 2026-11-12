import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';
import { type Coordinates } from '@/features/weather/domain/Coordinates';
import { type DeviceLocationService, type LocationPermission } from '@/features/weather/domain/repositories';

/** Lisbon, rounded: where the fake device is unless a test moves it. */
export const FAKE_DEVICE_POSITION: Coordinates = { latitude: 38.72, longitude: -9.14 };

/**
 * Stateful {@link DeviceLocationService}: no native modules. Permission starts
 * `undetermined`; `answerPromptWith` decides what the "user" picks at the prompt.
 */
export class FakeDeviceLocationService implements DeviceLocationService {
  permission: LocationPermission = 'undetermined';
  /** What the user chooses when the system prompt appears. */
  answerPromptWith: LocationPermission = 'granted';
  position: Result<Coordinates, AppError> = ok(FAKE_DEVICE_POSITION);
  readonly requestPermission = jest.fn(async (): Promise<LocationPermission> => {
    if (this.permission === 'undetermined' || this.permission === 'denied') this.permission = this.answerPromptWith;
    return this.permission;
  });
  readonly getCurrentPosition = jest.fn(async (signal?: AbortSignal): Promise<Result<Coordinates, AppError>> => {
    if (signal?.aborted) return err(new AppError('cancelled', 'Locating was cancelled'));
    return this.position;
  });

  async getPermission(): Promise<LocationPermission> {
    return this.permission;
  }
}
