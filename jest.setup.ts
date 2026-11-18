import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';

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
