import { type Coordinates } from '@/features/weather/domain/Coordinates';

/** URLs to try in order to open directions to a place in an external maps app. `platform` is `Platform.OS`. */
export function buildDirectionsUrls(destination: Coordinates, name: string, platform: string): string[] {
  const position = `${destination.latitude},${destination.longitude}`;
  // encodeURIComponent leaves ( and ), which would end the Android geo: label early.
  const label = encodeURIComponent(name).replace(/\(/g, '%28').replace(/\)/g, '%29');
  const web = `https://www.google.com/maps/dir/?api=1&destination=${position}`;
  if (platform === 'ios') return [`https://maps.apple.com/?daddr=${position}&q=${label}`, web];
  if (platform === 'android') return [`geo:${position}?q=${position}(${label})`, web];
  return [web];
}
