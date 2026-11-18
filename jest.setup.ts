import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';
import { type ViewProps } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

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
