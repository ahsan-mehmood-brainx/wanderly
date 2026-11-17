import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';
import { type LocationService } from '@/features/map/domain/repositories';
import { type Coordinates } from '@/features/weather/domain/Coordinates';
import { type LocationPermission } from '@/features/weather/domain/repositories';

/** Near the Eiffel Tower, at full precision: where the fake device is unless a test moves it. */
export const FAKE_MAP_POSITION: Coordinates = { latitude: 48.858372, longitude: 2.294481 };

/**
 * Stateful map {@link LocationService}: no native modules. Permission starts
 * `undetermined`; `answerPromptWith` decides what the "user" picks at the prompt.
 */
export class FakeLocationService implements LocationService {
  permission: LocationPermission = 'undetermined';
  /** What the user chooses when the system prompt appears. */
  answerPromptWith: LocationPermission = 'granted';
  position: Result<Coordinates, AppError> = ok(FAKE_MAP_POSITION);
  readonly requestPermission = jest.fn(async (): Promise<LocationPermission> => {
    if (this.permission === 'undetermined' || this.permission === 'denied') this.permission = this.answerPromptWith;
    return this.permission;
  });
  readonly getCurrentPosition = jest.fn(async (signal?: AbortSignal): Promise<Result<Coordinates, AppError>> => {
    if (signal?.aborted) return err(new AppError('cancelled', 'Locating was cancelled'));
    if (this.permission !== 'granted') {
      return err(new AppError('locationPermissionDenied', 'Location permission not granted'));
    }
    return this.position;
  });

  async getPermission(): Promise<LocationPermission> {
    return this.permission;
  }
}
