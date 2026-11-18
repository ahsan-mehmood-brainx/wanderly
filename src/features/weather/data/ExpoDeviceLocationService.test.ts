import { type LocationObject, type LocationPermissionResponse, PermissionStatus } from 'expo-location';

import { createTestLogger } from '@/testing/testDependencies';

import {
  DEFAULT_DEVICE_LOCATION_OPTIONS,
  type ExpoLocationApi,
  ExpoDeviceLocationService,
} from './ExpoDeviceLocationService';

const permission = (status: PermissionStatus, canAskAgain = true): LocationPermissionResponse => ({
  status,
  granted: status === PermissionStatus.GRANTED,
  canAskAgain,
  expires: 'never',
});

const position = (latitude: number, longitude: number): LocationObject => ({
  coords: { latitude, longitude, altitude: null, accuracy: 30, altitudeAccuracy: null, heading: null, speed: null },
  timestamp: 0,
});

function setup(overrides: Partial<jest.Mocked<ExpoLocationApi>> = {}) {
  const api: jest.Mocked<ExpoLocationApi> = {
    getForegroundPermissionsAsync: jest.fn(async () => permission(PermissionStatus.GRANTED)),
    requestForegroundPermissionsAsync: jest.fn(async () => permission(PermissionStatus.GRANTED)),
    hasServicesEnabledAsync: jest.fn(async () => true),
    getLastKnownPositionAsync: jest.fn(async () => null),
    getCurrentPositionAsync: jest.fn(async () => position(38.7223, -9.1393)),
    ...overrides,
  };
  return {
    api,
    service: new ExpoDeviceLocationService(createTestLogger(), api, {
      ...DEFAULT_DEVICE_LOCATION_OPTIONS,
      timeoutMs: 50,
    }),
  };
}

describe('ExpoDeviceLocationService', () => {
  it('maps expo permission responses to the app’s permission states', async () => {
    const { api, service } = setup();

    api.getForegroundPermissionsAsync.mockResolvedValueOnce(permission(PermissionStatus.UNDETERMINED));
    expect(await service.getPermission()).toBe('undetermined');
    api.getForegroundPermissionsAsync.mockResolvedValueOnce(permission(PermissionStatus.DENIED, true));
    expect(await service.getPermission()).toBe('denied');
    api.getForegroundPermissionsAsync.mockResolvedValueOnce(permission(PermissionStatus.DENIED, false));
    expect(await service.getPermission()).toBe('blocked');
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

  it('prefers a recent last-known position (instant, no GPS)', async () => {
    const { api, service } = setup({ getLastKnownPositionAsync: jest.fn(async () => position(48.85, 2.29)) });

    expect(await service.getCurrentPosition()).toEqual({ ok: true, value: { latitude: 48.85, longitude: 2.29 } });
    expect(api.getLastKnownPositionAsync).toHaveBeenCalledWith({ maxAge: 600_000, requiredAccuracy: 5_000 });
    expect(api.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('otherwise asks for a fresh, coarse fix', async () => {
    const { service } = setup();
    expect(await service.getCurrentPosition()).toEqual({ ok: true, value: { latitude: 38.7223, longitude: -9.1393 } });
  });

  it('fails without permission and never prompts', async () => {
    const { api, service } = setup({
      getForegroundPermissionsAsync: jest.fn(async () => permission(PermissionStatus.UNDETERMINED)),
    });

    const result = await service.getCurrentPosition();

    expect(!result.ok && result.error.kind).toBe('locationPermissionDenied');
    expect(api.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('reports location services turned off as unavailable', async () => {
    const { api, service } = setup({ hasServicesEnabledAsync: jest.fn(async () => false) });

    const result = await service.getCurrentPosition();

    expect(!result.ok && result.error.kind).toBe('locationUnavailable');
    expect(api.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('gives up on a fix that takes too long, and on one that errors', async () => {
    const slow = setup({ getCurrentPositionAsync: jest.fn(() => new Promise<LocationObject>(() => {})) });
    const timedOut = await slow.service.getCurrentPosition();
    expect(!timedOut.ok && timedOut.error.kind).toBe('locationUnavailable');

    const failing = setup({ getCurrentPositionAsync: jest.fn().mockRejectedValue(new Error('kCLErrorDomain 0')) });
    const failed = await failing.service.getCurrentPosition();
    expect(!failed.ok && failed.error.kind).toBe('locationUnavailable');
  });

  it('is cancelled by an aborted signal', async () => {
    const { service } = setup();
    const controller = new AbortController();
    controller.abort();

    const result = await service.getCurrentPosition(controller.signal);

    expect(!result.ok && result.error.kind).toBe('cancelled');
  });
});
