import { parseDestinationRouteId, parseRouteId } from '@/shared/navigation/routes';

import { countryDestinationId, parseDestinationId, placeDestinationId } from './DestinationId';
import { CURATED_DESTINATIONS } from './editorial';

describe('destination ids', () => {
  it('round-trips countries', () => {
    expect(countryDestinationId('PT')).toBe('country-pt');
    expect(parseDestinationId('country-pt')).toEqual({ kind: 'country', code: 'PT' });
  });

  it.each([
    ['Lisbon', 'PT'],
    ['Reykjavík', 'IS'],
    ['Hạ Long Bay', 'VN'],
    ['Washington, D.C.', 'US'],
    ['AC/DC', null],
    ['東京', 'JP'],
    ['Queenstown, New Zealand', null],
    ['🏖️ Beach', null],
  ])('round-trips the place %s (%s) through a URL-safe id', (title, countryCode) => {
    const id = placeDestinationId(title, countryCode);

    expect(id).toMatch(/^place-[A-Za-z0-9_-]+$/);
    expect(parseDestinationRouteId(id)).toBe(id);
    expect(parseDestinationId(id)).toEqual({ kind: 'place', title, countryCode });
  });

  it('accepts curated slugs, which also pass the generic route-id check', () => {
    for (const { slug } of CURATED_DESTINATIONS) {
      expect(parseDestinationId(slug)).toEqual({ kind: 'curated', slug });
      expect(parseRouteId(slug)).toBe(slug);
    }
  });

  it.each([
    ['', 'empty'],
    ['country-', 'missing code'],
    ['country-por', 'three-letter code'],
    ['country-p1', 'digit in code'],
    ['Kyoto', 'uppercase slug'],
    ['kyoto--x', 'double dash slug'],
    ['place-', 'empty payload'],
    ['place-!!', 'not base64url'],
    ['place-A', 'impossible base64 length'],
    [`place-${btoa('XX').replace(/=+$/, '')}`, 'no separator'],
    [`place-${btoa('PRT~Lisbon').replace(/=+$/, '')}`, 'three-letter country'],
    [`place-${btoa('PT~').replace(/=+$/, '')}`, 'empty title'],
    [`place-${btoa('~a\u0000b').replace(/=+$/, '')}`, 'control character'],
    ['place-gA', 'invalid UTF-8 (lone continuation byte 0x80)'],
    ['place-wIA', 'overlong UTF-8 encoding (0xC0 0x80)'],
    ['place-_4CA', 'byte that can never start a sequence (0xFF 0x80 0x80)'],
  ])('rejects %j (%s)', (id) => {
    expect(parseDestinationId(id)).toBeNull();
  });
});
