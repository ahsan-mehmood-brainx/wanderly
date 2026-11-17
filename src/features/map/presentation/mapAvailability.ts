export interface MapEnvironment {
  /** `Platform.OS`. */
  readonly os: string;
  /** `Constants.expoConfig?.android?.config?.googleMaps?.apiKey`. */
  readonly googleMapsApiKey: string | null | undefined;
  /** `Constants.executionEnvironment` (`storeClient` is Expo Go, which bundles its own key). */
  readonly executionEnvironment: string | null | undefined;
}

/**
 * Whether MapView may be mounted. The Google Maps SDK crashes on Android without
 * a key, so the map is never mounted there unless a key is configured (or in Expo Go).
 */
export function isMapAvailable({ os, googleMapsApiKey, executionEnvironment }: MapEnvironment): boolean {
  if (os === 'ios') return true;
  if (os !== 'android') return false;
  return executionEnvironment === 'storeClient' || Boolean(googleMapsApiKey?.trim());
}
