import { coordinatesKey, roundCoordinates, validateCoordinates } from './Coordinates';

describe('validateCoordinates', () => {
  it('accepts a real position and rounds it to two decimals (~1 km)', () => {
    expect(validateCoordinates({ latitude: 38.722252, longitude: -9.139337 })).toEqual({
      ok: true,
      value: { latitude: 38.72, longitude: -9.14 },
    });
  });

  it('accepts the extremes of the valid range', () => {
    expect(validateCoordinates({ latitude: 90, longitude: 180 }).ok).toBe(true);
    expect(validateCoordinates({ latitude: -90, longitude: -180 }).ok).toBe(true);
    // The equator and the prime meridian are fine on their own.
    expect(validateCoordinates({ latitude: 0, longitude: 32.58 }).ok).toBe(true);
    expect(validateCoordinates({ latitude: 51.48, longitude: 0 }).ok).toBe(true);
  });

  it('treats a missing position as "location unavailable"', () => {
    for (const missing of [null, undefined]) {
      const result = validateCoordinates(missing);
      expect(!result.ok && result.error.kind).toBe('locationUnavailable');
    }
  });

  it.each([
    ['latitude above 90', { latitude: 90.01, longitude: 0 }],
    ['latitude below -90', { latitude: -95, longitude: 10 }],
    ['longitude beyond 180', { latitude: 10, longitude: 180.5 }],
    ['NaN', { latitude: Number.NaN, longitude: 10 }],
    ['infinity', { latitude: 10, longitude: Number.POSITIVE_INFINITY }],
    ['a missing half', { latitude: 10 }],
    ['strings from a URL', { latitude: '38.7', longitude: '-9.1' } as unknown as { latitude: number }],
    ['Null Island (0,0), the signature of a defaulted value', { latitude: 0, longitude: 0 }],
  ])('rejects %s as an invalid location', (_name, location) => {
    const result = validateCoordinates(location);
    expect(!result.ok && result.error.kind).toBe('invalidLocation');
  });
});

describe('roundCoordinates / coordinatesKey', () => {
  it('never produces negative zero, so nearby points share a key', () => {
    expect(roundCoordinates({ latitude: -0.001, longitude: 0.004 })).toEqual({ latitude: 0, longitude: 0 });
    expect(Object.is(roundCoordinates({ latitude: -0.001, longitude: 1 }).latitude, -0)).toBe(false);
    expect(coordinatesKey({ latitude: -0.001, longitude: 12 })).toBe('0.00,12.00');
  });

  it('gives positions within the same ~1 km cell the same key', () => {
    expect(coordinatesKey({ latitude: 38.7223, longitude: -9.1393 })).toBe(
      coordinatesKey({ latitude: 38.7249, longitude: -9.1351 }),
    );
    expect(coordinatesKey({ latitude: 38.72, longitude: -9.14 })).toBe('38.72,-9.14');
  });
});
