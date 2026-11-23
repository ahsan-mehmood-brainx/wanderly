import { type PermissionResponse } from 'expo-camera';
import {
  getMediaLibraryPermissionsAsync,
  type MediaLibraryPermissionResponse,
  requestMediaLibraryPermissionsAsync,
} from 'expo-image-picker';

import { createTestLogger } from '@/testing/testDependencies';

import { ExpoMediaPermissionService } from './ExpoMediaPermissionService';

jest.mock('expo-camera', () => {
  const camera = { getCameraPermissionsAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn() };
  return { __esModule: true, Camera: camera, ...camera };
});

jest.mock('expo-image-picker', () => ({
  getMediaLibraryPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
}));

interface CameraModule {
  readonly Camera: {
    readonly getCameraPermissionsAsync: jest.Mock;
    readonly requestCameraPermissionsAsync: jest.Mock;
  };
}

const camera = jest.requireMock<CameraModule>('expo-camera').Camera;
const getLibrary = jest.mocked(getMediaLibraryPermissionsAsync);
const requestLibrary = jest.mocked(requestMediaLibraryPermissionsAsync);

type Status = 'granted' | 'denied' | 'undetermined';

const response = (status: Status, canAskAgain = true): PermissionResponse =>
  ({ status, granted: status === 'granted', canAskAgain, expires: 'never' }) as PermissionResponse;

const library = (
  status: Status,
  canAskAgain = true,
  accessPrivileges?: 'all' | 'limited' | 'none',
): MediaLibraryPermissionResponse => ({ ...response(status, canAskAgain), accessPrivileges });

function setup() {
  const logger = createTestLogger();
  return { logger, service: new ExpoMediaPermissionService(logger) };
}

beforeEach(() => {
  camera.getCameraPermissionsAsync.mockReset();
  camera.requestCameraPermissionsAsync.mockReset();
  getLibrary.mockReset();
  requestLibrary.mockReset();
});

describe('ExpoMediaPermissionService', () => {
  it.each<[string, PermissionResponse, string]>([
    ['granted', response('granted'), 'granted'],
    ['not asked yet', response('undetermined'), 'undetermined'],
    ['declined, can ask again', response('denied', true), 'denied'],
    ['declined for good', response('denied', false), 'blocked'],
  ])('maps a camera permission that is %s', async (_name, answer, expected) => {
    const { service } = setup();
    camera.getCameraPermissionsAsync.mockResolvedValueOnce(answer);
    camera.requestCameraPermissionsAsync.mockResolvedValueOnce(answer);

    await expect(service.getPermission('camera')).resolves.toBe(expected);
    await expect(service.requestPermission('camera')).resolves.toBe(expected);
    expect(getLibrary).not.toHaveBeenCalled();
  });

  it.each<[string, MediaLibraryPermissionResponse, string]>([
    ['fully granted', library('granted', true, 'all'), 'granted'],
    ['granted without privileges info (Android)', library('granted', true), 'granted'],
    ['limited to selected photos (iOS)', library('granted', true, 'limited'), 'limited'],
    ['not asked yet', library('undetermined'), 'undetermined'],
    ['declined, can ask again', library('denied', true, 'none'), 'denied'],
    ['declined for good', library('denied', false, 'none'), 'blocked'],
  ])('maps a photo library permission that is %s', async (_name, answer, expected) => {
    const { service } = setup();
    getLibrary.mockResolvedValueOnce(answer);
    requestLibrary.mockResolvedValueOnce(answer);

    await expect(service.getPermission('library')).resolves.toBe(expected);
    await expect(service.requestPermission('library')).resolves.toBe(expected);
    expect(camera.getCameraPermissionsAsync).not.toHaveBeenCalled();
  });

  it('asks for read access to the library, not write-only access', async () => {
    const { service } = setup();
    requestLibrary.mockResolvedValueOnce(library('granted', true, 'all'));

    await service.requestPermission('library');

    expect(requestLibrary).toHaveBeenCalledTimes(1);
    expect(requestLibrary).not.toHaveBeenCalledWith(true);
  });

  it('treats a failing permission API as denied and logs it', async () => {
    const { service, logger } = setup();
    camera.getCameraPermissionsAsync.mockRejectedValueOnce(new Error('native'));
    requestLibrary.mockRejectedValueOnce(new Error('native'));

    await expect(service.getPermission('camera')).resolves.toBe('denied');
    await expect(service.requestPermission('library')).resolves.toBe('denied');
    expect(logger.warn).toHaveBeenCalled();
  });
});
