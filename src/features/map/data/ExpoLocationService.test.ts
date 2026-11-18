import { Accuracy, type LocationObject, type LocationPermissionResponse, PermissionStatus } from 'expo-location';

import { createTestLogger } from '@/testing/testDependencies';

import { DEFAULT_MAP_LOCATION_OPTIONS, type ExpoLocationApi, ExpoLocationService } from './ExpoLocationService';

const permission = (status: PermissionStatus, canAskAgain = true): LocationPermissionResponse => ({
  status,
  granted: status === PermissionStatus.GRANTED,
  canAskAgain,
  expires: 'never',
});

const position = (latitude: number, longitude: number): LocationObject => ({
  coords: { latitude, longitude, altitude: null, accuracy: 20, altitudeAccuracy: null, heading: null, speed: null },
  timestamp: 0,
});

function setup(overrides: Partial<jest.Mocked<ExpoLocationApi>> = {}) {
  const api: jest.Mocked<ExpoLocationApi> = {
    getForegroundPermissionsAsync: jest.fn(async () => permission(PermissionStatus.GRANTED)),
    requestForegroundPermissionsAsync: jest.fn(async () => permission(PermissionStatus.GRANTED)),
    hasServicesEnabledAsync: jest.fn(async () => true),
    getLastKnownPositionAsync: jest.fn(async () => null),
    getCurrentPositionAsync: jest.fn(async () => position(48.858372, 2.294481)),
    ...overrides,
  };
  const logger = createTestLogger();
  return {
    api,
    logger,
    service: new ExpoLocationService(logger, api, { ...DEFAULT_MAP_LOCATION_OPTIONS, timeoutMs: 50 }),
  };
}

describe('ExpoLocationService', () => {
  it('waits up to 15 s for a fresh fix by default', async () => {
    jest.useFakeTimers();
    try {
      const api: jest.Mocked<ExpoLocationApi> = {
        getForegroundPermissionsAsync: jest.fn(async () => permission(PermissionStatus.GRANTED)),
        requestForegroundPermissionsAsync: jest.fn(async () => permission(PermissionStatus.GRANTED)),
        hasServicesEnabledAsync: jest.fn(async () => true),
        getLastKnownPositionAsync: jest.fn(async () => null),
        getCurrentPositionAsync: jest.fn(() => new Promise<LocationObject>(() => {})),
      };
      const settled = jest.fn();
      void new ExpoLocationService(createTestLogger(), api).getCurrentPosition().then(settled);

      await jest.advanceTimersByTimeAsync(14_900);
      expect(settled).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(100);
      expect(settled).toHaveBeenCalledWith(
        expect.objectContaining({ ok: false, error: expect.objectContaining({ kind: 'locationUnavailable' }) }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('maps expo permission responses to the app’s permission states', async () => {
    const { api, service } = setup();

    api.getForegroundPermissionsAsync.mockResolvedValueOnce(permission(PermissionStatus.UNDETERMINED));
    expect(await service.getPermission()).toBe('undetermined');
    api.getForegroundPermissionsAsync.mockResolvedValueOnce(permission(PermissionStatus.DENIED, true));
    expect(await service.getPermission()).toBe('denied');
    api.getForegroundPermissionsAsync.mockResolvedValueOnce(permission(PermissionStatus.DENIED, false));
    expect(await service.getPermission()).toBe('blocked');
    api.getForegroundPermissionsAsync.mockResolvedValueOnce(permission(PermissionStatus.GRANTED));
    expect(await service.getPermission()).toBe('granted');

    api.requestForegroundPermissionsAsync.mockResolvedValueOnce(permission(PermissionStatus.DENIED, false));
    expect(await service.requestPermission()).toBe('blocked');
    expect(await service.requestPermission()).toBe('granted');
  });

  it('treats a failing permission API as denied', async () => {
    const { service } = setup({
      getForegroundPermissionsAsync: jest.fn().mockRejectedValue(new Error('native')),
      requestForegroundPermissionsAsync: jest.fn().mockRejectedValue(new Error('native')),
    });

    expect(await service.getPermission()).toBe('denied');
    expect(await service.requestPermission()).toBe('denied');
  });

  it('returns locationPermissionDenied without permission, and never prompts', async () => {
    const { api, service } = setup({
      getForegroundPermissionsAsync: jest.fn(async () => permission(PermissionStatus.DENIED)),
    });

    const result = await service.getCurrentPosition();

    expect(!result.ok && result.error.kind).toBe('locationPermissionDenied');
    expect(api.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(api.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('returns locationServicesDisabled when location services are off', async () => {
    const { api, service } = setup({ hasServicesEnabledAsync: jest.fn(async () => false) });

    const result = await service.getCurrentPosition();

    expect(!result.ok && result.error.kind).toBe('locationServicesDisabled');
    expect(api.getLastKnownPositionAsync).not.toHaveBeenCalled();
    expect(api.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('returns a recent, accurate last-known fix instantly, at full precision', async () => {
    const { api, service } = setup({ getLastKnownPositionAsync: jest.fn(async () => position(48.861147, 2.338028)) });

    const result = await service.getCurrentPosition();

    expect(result).toEqual({ ok: true, value: { latitude: 48.861147, longitude: 2.338028 } });
    expect(api.getLastKnownPositionAsync).toHaveBeenCalledWith({ maxAge: 120_000, requiredAccuracy: 100 });
    expect(api.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('otherwise asks for a fresh fix with Balanced accuracy, without rounding it', async () => {
    const { api, service } = setup();

    const result = await service.getCurrentPosition();

    expect(result).toEqual({ ok: true, value: { latitude: 48.858372, longitude: 2.294481 } });
    expect(api.getCurrentPositionAsync).toHaveBeenCalledWith(expect.objectContaining({ accuracy: Accuracy.Balanced }));
  });

  it('falls back to a fresh fix when reading the last-known position fails', async () => {
    const { service } = setup({ getLastKnownPositionAsync: jest.fn().mockRejectedValue(new Error('native')) });

    const result = await service.getCurrentPosition();

    expect(result).toEqual({ ok: true, value: { latitude: 48.858372, longitude: 2.294481 } });
  });

  it('returns locationUnavailable when no fix arrives in time', async () => {
    const { service } = setup({ getCurrentPositionAsync: jest.fn(() => new Promise<LocationObject>(() => {})) });

    const result = await service.getCurrentPosition();

    expect(!result.ok && result.error.kind).toBe('locationUnavailable');
  });

  it('returns locationUnavailable and logs when the native call throws', async () => {
    const { service, logger } = setup({
      getCurrentPositionAsync: jest.fn().mockRejectedValue(new Error('kCLErrorDomain 0')),
    });

    const result = await service.getCurrentPosition();

    expect(!result.ok && result.error.kind).toBe('locationUnavailable');
    expect(logger.warn).toHaveBeenCalled();
  });

  it.each([
    ['NaN', position(Number.NaN, 2.29)],
    ['out of range', position(48.85, 181)],
    ['0,0', position(0, 0)],
  ])('returns locationUnavailable for an invalid %s fix', async (_label, fix) => {
    const fresh = setup({ getCurrentPositionAsync: jest.fn(async () => fix) });
    const freshResult = await fresh.service.getCurrentPosition();
    expect(!freshResult.ok && freshResult.error.kind).toBe('locationUnavailable');

    const cached = setup({ getLastKnownPositionAsync: jest.fn(async () => fix) });
    const cachedResult = await cached.service.getCurrentPosition();
    expect(!cachedResult.ok && cachedResult.error.kind).toBe('locationUnavailable');
  });

  it('is cancelled by an already aborted signal, without touching the native module', async () => {
    const { api, service } = setup();
    const controller = new AbortController();
    controller.abort();

    const result = await service.getCurrentPosition(controller.signal);

    expect(!result.ok && result.error.kind).toBe('cancelled');
    expect(api.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('is cancelled when aborted while waiting for a fix', async () => {
    const controller = new AbortController();
    const { service } = setup({
      getCurrentPositionAsync: jest.fn(async () => {
        controller.abort();
        return position(48.858372, 2.294481);
      }),
    });

    const result = await service.getCurrentPosition(controller.signal);

    expect(!result.ok && result.error.kind).toBe('cancelled');
  });
});
