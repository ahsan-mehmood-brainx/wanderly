import { AppError } from '@/core/errors/AppError';
import { err, ok } from '@/core/result';
import { FakeDeviceLocationService } from '@/testing/FakeDeviceLocationService';

import { GetDeviceLocation, GetLocationPermission, RequestLocationPermission } from './deviceLocation';

describe('GetDeviceLocation', () => {
  it('returns the rounded position when permission is granted', async () => {
    const location = new FakeDeviceLocationService();
    location.permission = 'granted';
    location.position = ok({ latitude: 48.858372, longitude: 2.294481 });

    expect(await new GetDeviceLocation(location).execute()).toEqual({
      ok: true,
      value: { latitude: 48.86, longitude: 2.29 },
    });
  });

  it.each(['undetermined', 'denied', 'blocked'] as const)(
    'never prompts: with permission %s it fails without reading the position',
    async (permission) => {
      const location = new FakeDeviceLocationService();
      location.permission = permission;

      const result = await new GetDeviceLocation(location).execute();

      expect(!result.ok && result.error.kind).toBe('locationPermissionDenied');
      expect(location.getCurrentPosition).not.toHaveBeenCalled();
      expect(location.requestPermission).not.toHaveBeenCalled();
    },
  );

  it('passes through a position failure (services off, no fix)', async () => {
    const location = new FakeDeviceLocationService();
    location.permission = 'granted';
    location.position = err(new AppError('locationUnavailable', 'services off'));

    const result = await new GetDeviceLocation(location).execute();

    expect(!result.ok && result.error.kind).toBe('locationUnavailable');
  });

  it('treats an impossible position from the platform as no fix', async () => {
    const location = new FakeDeviceLocationService();
    location.permission = 'granted';
    location.position = ok({ latitude: 0, longitude: 0 });

    const result = await new GetDeviceLocation(location).execute();

    expect(!result.ok && result.error.kind).toBe('locationUnavailable');
  });
});

describe('location permission use cases', () => {
  it('reads without prompting, and requests on demand', async () => {
    const location = new FakeDeviceLocationService();

    expect(await new GetLocationPermission(location).execute()).toBe('undetermined');
    expect(location.requestPermission).not.toHaveBeenCalled();
    expect(await new RequestLocationPermission(location).execute()).toBe('granted');
    expect(location.requestPermission).toHaveBeenCalledTimes(1);
  });
});
