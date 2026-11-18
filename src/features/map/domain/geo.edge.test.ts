import { checkCoordinates, distanceMeters, formatPinLabel, roundTo } from './geo';

describe('geo edge cases', () => {
  it.each([
    [90, 180],
    [-90, -180],
    [0, 9.45],
    [51.4779, 0],
  ])('accepts the boundary or axis position %p,%p', (latitude, longitude) => {
    expect(checkCoordinates({ latitude, longitude }).ok).toBe(true);
  });

  it.each([
    [90.000001, 0.1],
    [0.1, -180.000001],
    [-0, -0],
    [Number.POSITIVE_INFINITY, 1],
  ])('rejects %p,%p', (latitude, longitude) => {
    expect(checkCoordinates({ latitude, longitude }).ok).toBe(false);
  });

  it('rejects numeric strings as coordinates', () => {
    expect(checkCoordinates({ latitude: '48.8' as unknown as number, longitude: 2.3 }).ok).toBe(false);
  });

  it('rounds tiny negative values to 0, never -0', () => {
    expect(Object.is(roundTo({ latitude: -0.0001, longitude: 2 }, 3).latitude, 0)).toBe(true);
  });

  it('measures across the antimeridian by the short way round', () => {
    const meters = distanceMeters({ latitude: 0, longitude: 179.999 }, { latitude: 0, longitude: -179.999 });

    expect(meters).toBeLessThan(300);
  });

  it('labels a pin just south of the equator without a minus sign on zero', () => {
    expect(formatPinLabel({ latitude: -0.000001, longitude: -0.000004 })).toBe('0.00000, 0.00000');
  });

  it('keeps the minus sign for pins that round to a non-zero negative value', () => {
    expect(formatPinLabel({ latitude: -33.856784, longitude: -0.000006 })).toBe('-33.85678, -0.00001');
  });
});
