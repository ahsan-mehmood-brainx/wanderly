import { isMapAvailable } from './mapAvailability';

describe('isMapAvailable', () => {
  it('always shows the map on iOS (Apple Maps needs no key)', () => {
    expect(isMapAvailable({ os: 'ios', googleMapsApiKey: undefined, executionEnvironment: 'standalone' })).toBe(true);
  });

  it('shows the map on Android when a Google Maps key is configured', () => {
    expect(isMapAvailable({ os: 'android', googleMapsApiKey: 'AIza-test', executionEnvironment: 'standalone' })).toBe(
      true,
    );
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
    ['blank', '   '],
  ])('never mounts the map on Android when the key is %s, outside Expo Go', (_label, googleMapsApiKey) => {
    expect(isMapAvailable({ os: 'android', googleMapsApiKey, executionEnvironment: 'standalone' })).toBe(false);
    expect(isMapAvailable({ os: 'android', googleMapsApiKey, executionEnvironment: 'bare' })).toBe(false);
  });

  it('trusts Expo Go on Android, which bundles its own key', () => {
    expect(isMapAvailable({ os: 'android', googleMapsApiKey: undefined, executionEnvironment: 'storeClient' })).toBe(
      true,
    );
  });

  it('has no map on the web', () => {
    expect(isMapAvailable({ os: 'web', googleMapsApiKey: 'AIza-test', executionEnvironment: 'bare' })).toBe(false);
  });
});
