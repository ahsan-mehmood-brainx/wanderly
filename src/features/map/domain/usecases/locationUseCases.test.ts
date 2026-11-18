import { AppError } from '@/core/errors/AppError';
import { err, ok } from '@/core/result';
import { FAKE_MAP_POSITION, FakeLocationService } from '@/testing/FakeLocationService';

import { CheckMapLocationPermission, GetCurrentLocation, RequestMapLocationPermission } from './locationUseCases';

describe('GetCurrentLocation', () => {
  it('returns the device position at full precision when permission is granted', async () => {
    const location = new FakeLocationService();
    location.permission = 'granted';

    expect(await new GetCurrentLocation(location).execute()).toEqual({ ok: true, value: FAKE_MAP_POSITION });
  });

  it.each(['undetermined', 'denied', 'blocked'] as const)(
    'never prompts: with permission %s it fails without reading the position',
    async (permission) => {
      const location = new FakeLocationService();
      location.permission = permission;

      const result = await new GetCurrentLocation(location).execute();

      expect(!result.ok && result.error.kind).toBe('locationPermissionDenied');
      expect(location.getCurrentPosition).not.toHaveBeenCalled();
      expect(location.requestPermission).not.toHaveBeenCalled();
    },
  );

  it('passes location services being off through as its own kind', async () => {
    const location = new FakeLocationService();
    location.permission = 'granted';
    location.position = err(new AppError('locationServicesDisabled', 'services off'));

    const result = await new GetCurrentLocation(location).execute();

    expect(!result.ok && result.error.kind).toBe('locationServicesDisabled');
  });

  it.each([
    ['0,0', { latitude: 0, longitude: 0 }],
    ['NaN', { latitude: Number.NaN, longitude: 2.29 }],
    ['out of range', { latitude: 48.85, longitude: 200 }],
  ])('treats an impossible %s fix as no fix', async (_label, position) => {
    const location = new FakeLocationService();
    location.permission = 'granted';
    location.position = ok(position);

    const result = await new GetCurrentLocation(location).execute();

    expect(!result.ok && result.error.kind).toBe('locationUnavailable');
  });

  it('passes the signal to the location service', async () => {
    const location = new FakeLocationService();
    location.permission = 'granted';
    const controller = new AbortController();

    await new GetCurrentLocation(location).execute({ signal: controller.signal });

    expect(location.getCurrentPosition).toHaveBeenCalledWith(controller.signal);
  });
});

describe('map location permission use cases', () => {
  it('reads without prompting, and requests on demand', async () => {
    const location = new FakeLocationService();

    expect(await new CheckMapLocationPermission(location).execute()).toBe('undetermined');
    expect(location.requestPermission).not.toHaveBeenCalled();
    expect(await new RequestMapLocationPermission(location).execute()).toBe('granted');
    expect(location.requestPermission).toHaveBeenCalledTimes(1);
  });
});
