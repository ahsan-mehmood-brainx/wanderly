import { AppError } from '@/core/errors/AppError';
import { err, type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';
import { type Coordinates } from '@/features/weather/domain/Coordinates';
import { type LocationPermission } from '@/features/weather/domain/repositories';

import { checkCoordinates } from '../geo';
import { type LocationService } from '../repositories';

export interface GetCurrentLocationInput {
  readonly signal?: AbortSignal;
}

/** The device's position at full precision. Never prompts; an invalid fix is `locationUnavailable`. */
export class GetCurrentLocation implements UseCase<GetCurrentLocationInput, Result<Coordinates, AppError>> {
  constructor(private readonly location: LocationService) {}

  async execute({ signal }: GetCurrentLocationInput = {}): Promise<Result<Coordinates, AppError>> {
    const permission = await this.location.getPermission();
    if (permission !== 'granted') {
      return err(new AppError('locationPermissionDenied', `Location permission is ${permission}`));
    }
    const position = await this.location.getCurrentPosition(signal);
    if (!position.ok) return position;
    const valid = checkCoordinates(position.value);
    return valid.ok ? valid : err(new AppError('locationUnavailable', 'The device reported an invalid position'));
  }
}

export class CheckMapLocationPermission implements UseCase<void, LocationPermission> {
  constructor(private readonly location: LocationService) {}

  execute(): Promise<LocationPermission> {
    return this.location.getPermission();
  }
}

export class RequestMapLocationPermission implements UseCase<void, LocationPermission> {
  constructor(private readonly location: LocationService) {}

  execute(): Promise<LocationPermission> {
    return this.location.requestPermission();
  }
}
