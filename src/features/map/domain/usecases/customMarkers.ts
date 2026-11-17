import { type AppError } from '@/core/errors/AppError';
import { ok, type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';
import { type Clock } from '@/core/utils/Clock';
import { type IdGenerator } from '@/core/utils/IdGenerator';
import { type Coordinates } from '@/features/weather/domain/Coordinates';

import { checkCoordinates } from '../geo';
import { type CustomMarker, MAX_CUSTOM_MARKERS } from '../Place';
import { type CustomMarkerRepository } from '../repositories';

export class LoadCustomMarkers implements UseCase<void, readonly CustomMarker[]> {
  constructor(private readonly repository: CustomMarkerRepository) {}

  execute(): Promise<readonly CustomMarker[]> {
    return this.repository.load();
  }
}

export interface AddCustomMarkerInput {
  readonly markers: readonly CustomMarker[];
  readonly coordinates: Coordinates;
}

export type AddCustomMarkerOutcome =
  | { readonly status: 'added'; readonly markers: readonly CustomMarker[]; readonly marker: CustomMarker }
  | { readonly status: 'limitReached' }
  | { readonly status: 'failed'; readonly error: AppError };

/** Adds and saves a pin, up to {@link MAX_CUSTOM_MARKERS}. */
export class AddCustomMarker implements UseCase<AddCustomMarkerInput, AddCustomMarkerOutcome> {
  constructor(
    private readonly repository: CustomMarkerRepository,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute({ markers, coordinates }: AddCustomMarkerInput): Promise<AddCustomMarkerOutcome> {
    if (markers.length >= MAX_CUSTOM_MARKERS) return { status: 'limitReached' };
    const valid = checkCoordinates(coordinates);
    if (!valid.ok) return { status: 'failed', error: valid.error };

    const marker: CustomMarker = { id: this.idGenerator(), coordinates: valid.value, createdAt: this.clock.now() };
    const next = [...markers, marker];
    const saved = await this.repository.save(next);
    if (!saved.ok) return { status: 'failed', error: saved.error };
    return { status: 'added', markers: next, marker };
  }
}

export interface RemoveCustomMarkerInput {
  readonly markers: readonly CustomMarker[];
  readonly id: string;
}

export class RemoveCustomMarker implements UseCase<RemoveCustomMarkerInput, Result<readonly CustomMarker[], AppError>> {
  constructor(private readonly repository: CustomMarkerRepository) {}

  async execute({ markers, id }: RemoveCustomMarkerInput): Promise<Result<readonly CustomMarker[], AppError>> {
    const next = markers.filter((marker) => marker.id !== id);
    const saved = await this.repository.save(next);
    return saved.ok ? ok(next) : saved;
  }
}
