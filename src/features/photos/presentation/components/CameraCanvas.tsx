import { CameraView, type CameraType } from 'expo-camera';
import { type Ref, useImperativeHandle, useRef } from 'react';
import { StyleSheet } from 'react-native';

import { parseExifDateTime } from '../../domain/imageValidation';
import { type PickedImage } from '../../domain/Photo';

export type CameraFacing = CameraType;

export interface CameraCanvasHandle {
  /** Captures a full-quality photo with EXIF into a temporary file. Throws if the camera can't. */
  takePicture(): Promise<PickedImage>;
}

interface CameraCanvasProps {
  readonly ref?: Ref<CameraCanvasHandle>;
  readonly facing: CameraFacing;
  readonly onReady: () => void;
  /** The camera couldn't start (no camera, in use elsewhere, or failed to initialise). */
  readonly onMountError: (message: string) => void;
}

function exifDateTimeOriginal(exif: unknown): unknown {
  return typeof exif === 'object' && exif !== null ? (exif as Record<string, unknown>).DateTimeOriginal : undefined;
}

/**
 * The live camera preview: the only place expo-camera's native view is used, so tests
 * can stand in for it (see jest.setup.ts) the way MapCanvas isolates the map.
 */
export function CameraCanvas({ ref, facing, onReady, onMountError }: CameraCanvasProps) {
  const camera = useRef<CameraView>(null);

  useImperativeHandle(
    ref,
    () => ({
      async takePicture() {
        const view = camera.current;
        if (!view) throw new Error('The camera is not mounted');
        // Full quality: the photo is resized and compressed once, when it is attached.
        const picture = await view.takePictureAsync({ quality: 1, exif: true, shutterSound: true });
        return {
          uri: picture.uri,
          width: picture.width,
          height: picture.height,
          fileSize: null,
          mimeType: picture.format === 'png' ? 'image/png' : 'image/jpeg',
          fileName: null,
          takenAt: parseExifDateTime(exifDateTimeOriginal(picture.exif)),
          source: 'camera',
        };
      },
    }),
    [],
  );

  return (
    <CameraView
      ref={camera}
      testID="camera-view"
      style={StyleSheet.absoluteFill}
      facing={facing}
      mode="picture"
      animateShutter
      onCameraReady={onReady}
      onMountError={({ message }) => onMountError(message)}
    />
  );
}
