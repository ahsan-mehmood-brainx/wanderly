import { AppError } from '@/core/errors/AppError';
import { err, type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';

import { type Coordinates, validateCoordinates } from '../Coordinates';
import { type DeviceLocationService, type LocationPermission } from '../repositories';

export interface GetDeviceLocationInput {
  readonly signal?: AbortSignal;
}

/**
 * The device's position, rounded (see `COORDINATE_DECIMALS`). Never prompts:
 * the UI asks for permission first, with context, through {@link RequestLocationPermission}.
 */
export class GetDeviceLocation implements UseCase<GetDeviceLocationInput, Result<Coordinates, AppError>> {
  constructor(private readonly location: DeviceLocationService) {}

  async execute({ signal }: GetDeviceLocationInput = {}): Promise<Result<Coordinates, AppError>> {
    const permission = await this.location.getPermission();
    if (permission !== 'granted') {
      return err(new AppError('locationPermissionDenied', `Location permission is ${permission}`));
    }
    const position = await this.location.getCurrentPosition(signal);
    if (!position.ok) return position;
    // A platform can report garbage (0,0 from a mock provider); treat it as no fix.
    const valid = validateCoordinates(position.value);
    return valid.ok ? valid : err(new AppError('locationUnavailable', 'The device reported an invalid position'));
  }
}

export class GetLocationPermission implements UseCase<void, LocationPermission> {
  constructor(private readonly location: DeviceLocationService) {}

  execute(): Promise<LocationPermission> {
    return this.location.getPermission();
  }
}

export class RequestLocationPermission implements UseCase<void, LocationPermission> {
  constructor(private readonly location: DeviceLocationService) {}

  execute(): Promise<LocationPermission> {
    return this.location.requestPermission();
  }
}
