import { checkCoordinates, distanceMeters, formatPinLabel, roundTo } from './geo';

describe('checkCoordinates', () => {
  it('accepts a real position and keeps its full precision', () => {
    expect(checkCoordinates({ latitude: 48.858372, longitude: 2.294481 })).toEqual({
      ok: true,
      value: { latitude: 48.858372, longitude: 2.294481 },
    });
    expect(checkCoordinates({ latitude: -90, longitude: 180 }).ok).toBe(true);
  });

  it.each([
    ['NaN latitude', { latitude: Number.NaN, longitude: 2 }],
    ['infinite longitude', { latitude: 48, longitude: Number.POSITIVE_INFINITY }],
    ['latitude above 90', { latitude: 90.0001, longitude: 2 }],
    ['longitude below -180', { latitude: 48, longitude: -180.5 }],
    ['0,0', { latitude: 0, longitude: 0 }],
    ['a missing longitude', { latitude: 48 }],
  ])('rejects %s as invalidLocation', (_label, location) => {
    const result = checkCoordinates(location);
    expect(!result.ok && result.error.kind).toBe('invalidLocation');
  });
});

describe('roundTo', () => {
  it('rounds both axes to the given number of decimals', () => {
    expect(roundTo({ latitude: 48.858372, longitude: 2.294481 }, 3)).toEqual({ latitude: 48.858, longitude: 2.294 });
    expect(roundTo({ latitude: -33.8567844, longitude: 151.2152967 }, 3)).toEqual({
      latitude: -33.857,
      longitude: 151.215,
    });
  });
});

describe('distanceMeters', () => {
  it('is zero between a point and itself', () => {
    expect(distanceMeters({ latitude: 48.8584, longitude: 2.2945 }, { latitude: 48.8584, longitude: 2.2945 })).toBe(0);
  });

  it('measures the great-circle distance (Eiffel Tower to the Louvre, London to Paris)', () => {
    const eiffelToLouvre = distanceMeters(
      { latitude: 48.8584, longitude: 2.2945 },
      { latitude: 48.8606, longitude: 2.3376 },
    );
    expect(eiffelToLouvre).toBeGreaterThan(3_140);
    expect(eiffelToLouvre).toBeLessThan(3_190);

    const londonToParis = distanceMeters(
      { latitude: 51.5074, longitude: -0.1278 },
      { latitude: 48.8566, longitude: 2.3522 },
    );
    expect(londonToParis).toBeGreaterThan(340_000);
    expect(londonToParis).toBeLessThan(347_000);
  });

  it('is symmetric', () => {
    const a = { latitude: 35.0116, longitude: 135.768 };
    const b = { latitude: 34.6937, longitude: 135.5023 };
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 6);
  });
});

describe('formatPinLabel', () => {
  it('labels a pin with its coordinates to 5 decimals', () => {
    expect(formatPinLabel({ latitude: 48.858372, longitude: 2.294481 })).toBe('48.85837, 2.29448');
    expect(formatPinLabel({ latitude: -33.8567844, longitude: 151.2152967 })).toBe('-33.85678, 151.21530');
  });
});
