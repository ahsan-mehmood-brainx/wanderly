import { Camera, type PermissionResponse } from 'expo-camera';
import {
  getMediaLibraryPermissionsAsync,
  type MediaLibraryPermissionResponse,
  requestMediaLibraryPermissionsAsync,
} from 'expo-image-picker';

import { type Logger } from '@/core/logging/Logger';

import { type MediaKind, type MediaPermission, type MediaPermissionService } from '../domain/repositories';

function toMediaPermission(response: PermissionResponse | MediaLibraryPermissionResponse): MediaPermission {
  if (response.status === 'granted') {
    return 'accessPrivileges' in response && response.accessPrivileges === 'limited' ? 'limited' : 'granted';
  }
  if (response.status === 'undetermined') return 'undetermined';
  // The system no longer shows the prompt: only the Settings app can turn access back on.
  return response.canAskAgain ? 'denied' : 'blocked';
}

/** Camera permission through expo-camera, photo library permission through expo-image-picker. */
export class ExpoMediaPermissionService implements MediaPermissionService {
  constructor(private readonly logger: Logger) {}

  getPermission(kind: MediaKind): Promise<MediaPermission> {
    return this.read(kind, 'read', () =>
      kind === 'camera' ? Camera.getCameraPermissionsAsync() : getMediaLibraryPermissionsAsync(),
    );
  }

  requestPermission(kind: MediaKind): Promise<MediaPermission> {
    // `requestMediaLibraryPermissionsAsync(true)` would ask for write-only access; picking needs read access.
    return this.read(kind, 'request', () =>
      kind === 'camera' ? Camera.requestCameraPermissionsAsync() : requestMediaLibraryPermissionsAsync(),
    );
  }

  private async read(
    kind: MediaKind,
    action: string,
    call: () => Promise<PermissionResponse | MediaLibraryPermissionResponse>,
  ): Promise<MediaPermission> {
    try {
      return toMediaPermission(await call());
    } catch (cause) {
      this.logger.warn(`Could not ${action} the ${kind} permission`, { cause });
      return 'denied';
    }
  }
}
