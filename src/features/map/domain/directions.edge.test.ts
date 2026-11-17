import { buildDirectionsUrls } from './directions';

const SYDNEY = { latitude: -33.8568, longitude: 151.2153 };

describe('buildDirectionsUrls edge cases', () => {
  it('encodes parentheses in the name so the Android geo: label is not cut short', () => {
    const [geo] = buildDirectionsUrls(SYDNEY, 'Café (Old Town)', 'android');

    expect(geo).toBe('geo:-33.8568,151.2153?q=-33.8568,151.2153(Caf%C3%A9%20%28Old%20Town%29)');
  });

  it('keeps negative coordinates intact in every URL', () => {
    expect(buildDirectionsUrls(SYDNEY, 'Opera House', 'ios')).toEqual([
      'https://maps.apple.com/?daddr=-33.8568,151.2153&q=Opera%20House',
      'https://www.google.com/maps/dir/?api=1&destination=-33.8568,151.2153',
    ]);
  });

  it('builds a valid URL for an empty name', () => {
    const [geo] = buildDirectionsUrls(SYDNEY, '', 'android');

    expect(geo).toBe('geo:-33.8568,151.2153?q=-33.8568,151.2153()');
  });
});
