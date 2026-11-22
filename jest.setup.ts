import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';
import { type ViewProps } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

// NetInfo has no native side in Jest. Tests use FakeConnectivityService; this keeps the production
// adapter (built by the composition root tests) from touching the missing native module.
jest.mock('@react-native-community/netinfo', () => require('@react-native-community/netinfo/jest/netinfo-mock.js'));

// Gesture Handler, Worklets and Reanimated have no native side in Jest. These mocks run gesture
// callbacks and worklets on the JS thread, so tests can drive gestures with `fireGestureHandler`.
// Reanimated's own mock loads its real entry point, which throws here, hence the local one. It also
// replaces `react-native-reanimated/mock`, which expo-router's testing library mocks Reanimated with.
require('react-native-gesture-handler/jestSetup');
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
jest.mock('react-native-reanimated', () => require('./src/testing/reanimatedMock'));
jest.mock('react-native-reanimated/mock', () => require('./src/testing/reanimatedMock'));

// Deterministic device locale for all tests (English, US). Override per test with jest.mocked(...).
jest.mock('expo-localization', () => {
  const locale = { languageCode: 'en', languageTag: 'en-US', regionCode: 'US', textDirection: 'ltr' };
  return {
    getLocales: jest.fn(() => [locale]),
    useLocales: jest.fn(() => [locale]),
  };
});

// SafeAreaProvider renders nothing until native insets are measured; use the library's official mock.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

type MockProps = ViewProps & Record<string, unknown>;

// react-native-maps needs native views. MapView and Marker become plain Views that keep every prop
// (testID, showsUserLocation, onPress, onLongPress, onMapReady), so tests fire map events directly.
jest.mock('react-native-maps', () => {
  const React: typeof import('react') = require('react');
  const { View }: typeof import('react-native') = require('react-native');
  const MapView = React.forwardRef<unknown, MockProps>(function MockMapView(props, ref) {
    React.useImperativeHandle(ref, () => ({
      animateToRegion: jest.fn(),
      animateCamera: jest.fn(),
      fitToCoordinates: jest.fn(),
      setCamera: jest.fn(),
    }));
    return React.createElement(View, props);
  });
  const Marker = (props: MockProps) => React.createElement(View, props);
  return {
    __esModule: true,
    default: MapView,
    MapView,
    Marker,
    Callout: Marker,
    PROVIDER_DEFAULT: undefined,
    PROVIDER_GOOGLE: 'google',
  };
});

// expo-camera needs the native camera. CameraView becomes a plain View that keeps every prop (testID,
// onCameraReady, onMountError) and reports ready once mounted. Its ref's `takePictureAsync` is the shared
// `mockCamera.takePictureAsync`, so a test controls captures via `jest.requireMock('expo-camera').mockCamera`.
jest.mock('expo-camera', () => {
  const React: typeof import('react') = require('react');
  const { View }: typeof import('react-native') = require('react-native');
  const granted = { status: 'granted', granted: true, canAskAgain: true, expires: 'never' };
  const mockCamera = {
    takePictureAsync: jest.fn(async () => ({
      uri: 'file:///cache/Camera/capture.jpg',
      width: 4032,
      height: 3024,
      format: 'jpg',
      exif: { DateTimeOriginal: '2027:06:15 09:30:00' },
    })),
  };
  const CameraView = React.forwardRef<unknown, MockProps>(function MockCameraView(props, ref) {
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: (...args: unknown[]) => mockCamera.takePictureAsync(...(args as [])),
      pausePreview: jest.fn(),
      resumePreview: jest.fn(),
    }));
    const { onCameraReady } = props as { onCameraReady?: () => void };
    React.useEffect(() => {
      onCameraReady?.();
    }, [onCameraReady]);
    return React.createElement(View, props);
  });
  return {
    __esModule: true,
    CameraView,
    mockCamera,
    getCameraPermissionsAsync: jest.fn(async () => granted),
    requestCameraPermissionsAsync: jest.fn(async () => granted),
    useCameraPermissions: jest.fn(() => [granted, jest.fn(async () => granted), jest.fn(async () => granted)]),
    Camera: {
      getCameraPermissionsAsync: jest.fn(async () => granted),
      requestCameraPermissionsAsync: jest.fn(async () => granted),
    },
  };
});
