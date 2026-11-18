import { AppError } from '@/core/errors/AppError';
import { err, ok } from '@/core/result';
import { type Coordinates } from '@/features/weather/domain/Coordinates';

import { type PlacesRepository } from '../repositories';
import { GetNearbyPlaces } from './GetNearbyPlaces';

function setup() {
  const repository: jest.Mocked<PlacesRepository> = {
    searchLocations: jest.fn<ReturnType<PlacesRepository['searchLocations']>, [string, AbortSignal?]>(async () =>
      ok([]),
    ),
    getNearby: jest.fn<ReturnType<PlacesRepository['getNearby']>, [Coordinates, AbortSignal?]>(async () => ok([])),
  };
  return { repository, getNearbyPlaces: new GetNearbyPlaces(repository) };
}

describe('GetNearbyPlaces', () => {
  it('rounds the centre to 3 decimals before asking for places, and passes the signal through', async () => {
    const { repository, getNearbyPlaces } = setup();
    const controller = new AbortController();

    const result = await getNearbyPlaces.execute({
      center: { latitude: 48.858372, longitude: 2.294481 },
      signal: controller.signal,
    });

    expect(result).toEqual({ ok: true, value: [] });
    expect(repository.getNearby).toHaveBeenCalledWith({ latitude: 48.858, longitude: 2.294 }, controller.signal);
  });

  it.each([
    ['NaN', { latitude: Number.NaN, longitude: 2.29 }],
    ['out of range', { latitude: 95, longitude: 2.29 }],
    ['0,0', { latitude: 0, longitude: 0 }],
  ])('returns invalidLocation for a %s centre and makes no request', async (_label, center) => {
    const { repository, getNearbyPlaces } = setup();

    const result = await getNearbyPlaces.execute({ center });

    expect(!result.ok && result.error.kind).toBe('invalidLocation');
    expect(repository.getNearby).not.toHaveBeenCalled();
  });

  it('passes repository failures through with their kind', async () => {
    const { repository, getNearbyPlaces } = setup();
    repository.getNearby.mockResolvedValueOnce(err(new AppError('rateLimited', '429')));

    const result = await getNearbyPlaces.execute({ center: { latitude: 48.85, longitude: 2.29 } });

    expect(!result.ok && result.error.kind).toBe('rateLimited');
  });
});
