import { pickedImage } from '@/testing/photoFixtures';

import { fitWithin, MAX_SOURCE_BYTES, parseExifDateTime, validatePickedImage } from './imageValidation';

describe('validatePickedImage edge cases', () => {
  it('accepts an upper-case MIME type', () => {
    expect(validatePickedImage(pickedImage({ mimeType: 'IMAGE/JPEG' }))).toEqual({ ok: true });
  });

  it('accepts a file exactly at the size limit and rejects one byte over', () => {
    expect(validatePickedImage(pickedImage({ fileSize: MAX_SOURCE_BYTES }))).toEqual({ ok: true });
    expect(validatePickedImage(pickedImage({ fileSize: MAX_SOURCE_BYTES + 1 }))).toEqual({
      ok: false,
      reason: 'tooLarge',
    });
  });

  it('accepts an image of unknown size', () => {
    expect(validatePickedImage(pickedImage({ fileSize: null }))).toEqual({ ok: true });
  });

  it('falls back to the URI extension, ignoring a query string, when type and name are missing', () => {
    const image = pickedImage({ mimeType: null, fileName: null, uri: 'file:///cache/a.HEIC?v=2#x' });
    expect(validatePickedImage(image)).toEqual({ ok: true });
  });

  it('rejects an image with no type and no extension', () => {
    const image = pickedImage({ mimeType: null, fileName: null, uri: 'file:///cache/blob' });
    expect(validatePickedImage(image)).toEqual({ ok: false, reason: 'unsupportedType' });
  });

  it('rejects a gif by extension when the type is missing', () => {
    const image = pickedImage({ mimeType: null, fileName: 'x.gif', uri: 'file:///cache/x.gif' });
    expect(validatePickedImage(image)).toEqual({ ok: false, reason: 'unsupportedType' });
  });

  it('rejects an empty MIME type string by falling back to the extension', () => {
    const image = pickedImage({ mimeType: '', fileName: 'x.mp4', uri: 'file:///cache/x.mp4' });
    expect(validatePickedImage(image)).toEqual({ ok: false, reason: 'unsupportedType' });
  });

  it.each([
    ['NaN width', { width: Number.NaN }],
    ['fractional height', { height: 10.5 }],
    ['negative width', { width: -4 }],
    ['infinite height', { height: Number.POSITIVE_INFINITY }],
  ])('rejects invalid dimensions: %s', (_name, overrides) => {
    expect(validatePickedImage(pickedImage(overrides))).toEqual({ ok: false, reason: 'invalidDimensions' });
  });
});

describe('fitWithin edge cases', () => {
  it('never shrinks a side below one pixel for an extreme panorama', () => {
    expect(fitWithin(20000, 1, 2048)).toEqual({ width: 2048, height: 1 });
    expect(fitWithin(1, 20000, 2048)).toEqual({ width: 1, height: 2048 });
  });

  it('keeps an image exactly at the limit unchanged', () => {
    expect(fitWithin(2048, 1000, 2048)).toEqual({ width: 2048, height: 1000 });
  });
});

describe('parseExifDateTime edge cases', () => {
  it('rejects 30 February', () => {
    expect(parseExifDateTime('2027:02:30 10:00:00')).toBeNull();
  });

  it('accepts 29 February of a leap year', () => {
    expect(parseExifDateTime('2028:02:29 23:59:59')).toBe(new Date(2028, 1, 29, 23, 59, 59).getTime());
  });

  it('rejects the all-zero camera default date', () => {
    expect(parseExifDateTime('0000:00:00 00:00:00')).toBeNull();
  });

  it('rejects hour 24 and a date with dashes', () => {
    expect(parseExifDateTime('2027:06:01 24:00:00')).toBeNull();
    expect(parseExifDateTime('2027-06-01 10:00:00')).toBeNull();
  });

  it('trims surrounding whitespace and rejects non-strings', () => {
    expect(parseExifDateTime(' 2027:06:01 10:00:00 ')).toBe(new Date(2027, 5, 1, 10).getTime());
    expect(parseExifDateTime(20270601)).toBeNull();
    expect(parseExifDateTime(null)).toBeNull();
    expect(parseExifDateTime('')).toBeNull();
  });
});
