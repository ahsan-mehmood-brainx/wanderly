import { buildDirectionsUrls } from './directions';

const LOUVRE = { latitude: 48.8606, longitude: 2.3376 };
const GOOGLE_FALLBACK = 'https://www.google.com/maps/dir/?api=1&destination=48.8606,2.3376';

describe('buildDirectionsUrls', () => {
  it('opens Apple Maps on iOS, with Google Maps on the web as a fallback', () => {
    expect(buildDirectionsUrls(LOUVRE, 'Musée du Louvre', 'ios')).toEqual([
      'https://maps.apple.com/?daddr=48.8606,2.3376&q=Mus%C3%A9e%20du%20Louvre',
      GOOGLE_FALLBACK,
    ]);
  });

  it('opens the geo: chooser on Android, with Google Maps on the web as a fallback', () => {
    expect(buildDirectionsUrls(LOUVRE, 'Musée du Louvre', 'android')).toEqual([
      'geo:48.8606,2.3376?q=48.8606,2.3376(Mus%C3%A9e%20du%20Louvre)',
      GOOGLE_FALLBACK,
    ]);
  });

  it('encodes characters that would break the URL', () => {
    const [ios] = buildDirectionsUrls(LOUVRE, 'Fish & Chips #1?', 'ios');
    expect(ios).toBe('https://maps.apple.com/?daddr=48.8606,2.3376&q=Fish%20%26%20Chips%20%231%3F');
  });

  it('uses only the Google Maps URL on other platforms', () => {
    expect(buildDirectionsUrls(LOUVRE, 'Louvre', 'web')).toEqual([GOOGLE_FALLBACK]);
  });
});
