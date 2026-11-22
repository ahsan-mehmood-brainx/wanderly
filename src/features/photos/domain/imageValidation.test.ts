import { pickedImage } from '@/testing/photoFixtures';

import {
  fitWithin,
  JPEG_QUALITY,
  MAX_EDGE,
  MAX_PHOTOS_PER_TRIP,
  MAX_SELECTION,
  MAX_SOURCE_BYTES,
  parseExifDateTime,
  validatePickedImage,
} from './imageValidation';
import { type PickedImage } from './Photo';

describe('validatePickedImage', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'IMAGE/JPEG'])(
    'accepts %s',
    (mimeType) => {
      expect(validatePickedImage(pickedImage({ mimeType }))).toEqual({ ok: true });
    },
  );

  it.each<[string, Partial<PickedImage>]>([
    ['a jpg', { fileName: 'IMG_1.jpg' }],
    ['a JPEG', { fileName: 'IMG_1.JPEG' }],
    ['a png', { fileName: 'shot.png' }],
    ['a webp', { fileName: 'pic.webp' }],
    ['a HEIC', { fileName: 'IMG_2.HEIC' }],
    ['a heif uri', { fileName: null, uri: 'file:///cache/pic.heif' }],
  ])('falls back to the extension of %s when the type is missing', (_name, overrides) => {
    expect(validatePickedImage(pickedImage({ mimeType: null, ...overrides }))).toEqual({ ok: true });
  });

  it.each<[string, Partial<PickedImage>]>([
    ['a GIF', { mimeType: 'image/gif', fileName: 'party.gif', uri: 'file:///cache/party.gif' }],
    ['a video', { mimeType: 'video/mp4', fileName: 'clip.mp4', uri: 'file:///cache/clip.mp4' }],
    ['a PDF', { mimeType: 'application/pdf', fileName: 'ticket.pdf', uri: 'file:///cache/ticket.pdf' }],
    ['an SVG', { mimeType: 'image/svg+xml', fileName: 'logo.svg', uri: 'file:///cache/logo.svg' }],
    ['no type and no extension', { mimeType: null, fileName: null, uri: 'content://media/external/images/42' }],
    ['no type and a gif name', { mimeType: null, fileName: 'party.gif', uri: 'file:///cache/party.gif' }],
    ['a video named like a photo', { mimeType: 'video/quicktime', fileName: 'IMG_9.jpg' }],
  ])('rejects %s as an unsupported type', (_name, overrides) => {
    expect(validatePickedImage(pickedImage(overrides))).toEqual({ ok: false, reason: 'unsupportedType' });
  });

  it('accepts a file of exactly 50 MB and rejects one byte more', () => {
    expect(validatePickedImage(pickedImage({ fileSize: MAX_SOURCE_BYTES }))).toEqual({ ok: true });
    expect(validatePickedImage(pickedImage({ fileSize: MAX_SOURCE_BYTES + 1 }))).toEqual({
      ok: false,
      reason: 'tooLarge',
    });
  });

  it('accepts an image whose size is unknown', () => {
    expect(validatePickedImage(pickedImage({ fileSize: null }))).toEqual({ ok: true });
  });

  it.each<[string, Partial<PickedImage>]>([
    ['zero width', { width: 0 }],
    ['zero height', { height: 0 }],
    ['negative width', { width: -10 }],
    ['NaN height', { height: Number.NaN }],
    ['infinite width', { width: Number.POSITIVE_INFINITY }],
    ['fractional width', { width: 10.5 }],
  ])('rejects %s as invalid dimensions', (_name, overrides) => {
    expect(validatePickedImage(pickedImage(overrides))).toEqual({ ok: false, reason: 'invalidDimensions' });
  });

  it('reports the type before the size or dimensions', () => {
    const image = pickedImage({ mimeType: 'image/gif', fileName: 'a.gif', fileSize: MAX_SOURCE_BYTES * 2, width: 0 });
    expect(validatePickedImage(image)).toEqual({ ok: false, reason: 'unsupportedType' });
  });
});

describe('fitWithin', () => {
  it.each([
    [4032, 3024, 2048, { width: 2048, height: 1536 }],
    [3024, 4032, 2048, { width: 1536, height: 2048 }],
    [5000, 5000, 2048, { width: 2048, height: 2048 }],
    [8000, 1000, 2048, { width: 2048, height: 256 }],
    [3000, 2001, 2048, { width: 2048, height: 1366 }],
  ])('scales %i x %i down to fit %i on the longest edge', (width, height, maxEdge, expected) => {
    expect(fitWithin(width, height, maxEdge)).toEqual(expected);
  });

  it('never enlarges a small image', () => {
    expect(fitWithin(640, 480, 2048)).toEqual({ width: 640, height: 480 });
    expect(fitWithin(2048, 100, 2048)).toEqual({ width: 2048, height: 100 });
  });

  it('keeps at least one pixel on the short edge of a very long image', () => {
    expect(fitWithin(100_000, 10, 2048)).toEqual({ width: 2048, height: 1 });
  });
});

describe('parseExifDateTime', () => {
  it('reads an EXIF date as device-local time', () => {
    expect(parseExifDateTime('2027:06:12 18:30:05')).toBe(new Date(2027, 5, 12, 18, 30, 5).getTime());
  });

  it.each<[string, unknown]>([
    ['an empty string', ''],
    ['garbage', 'yesterday'],
    ['the all-zero placeholder cameras write', '0000:00:00 00:00:00'],
    ['month 13', '2027:13:01 10:00:00'],
    ['30 February', '2027:02:30 10:00:00'],
    ['hour 25', '2027:06:12 25:00:00'],
    ['a number', 1_781_000_000_000],
    ['null', null],
    ['undefined', undefined],
    ['an object', { value: '2027:06:12 18:30:05' }],
  ])('returns null for %s', (_name, value) => {
    expect(parseExifDateTime(value)).toBeNull();
  });
});

describe('photo limits', () => {
  it('match the agreed product limits', () => {
    expect({ MAX_SOURCE_BYTES, MAX_EDGE, JPEG_QUALITY, MAX_PHOTOS_PER_TRIP, MAX_SELECTION }).toEqual({
      MAX_SOURCE_BYTES: 52_428_800,
      MAX_EDGE: 2048,
      JPEG_QUALITY: 0.8,
      MAX_PHOTOS_PER_TRIP: 200,
      MAX_SELECTION: 10,
    });
  });
});
