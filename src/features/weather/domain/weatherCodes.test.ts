import { conditionFromWmoCode } from './weatherCodes';

describe('conditionFromWmoCode', () => {
  it.each([
    [0, 'clear'],
    [1, 'mainlyClear'],
    [2, 'partlyCloudy'],
    [3, 'overcast'],
    [45, 'fog'],
    [48, 'fog'],
    [51, 'drizzle'],
    [55, 'drizzle'],
    [56, 'freezingDrizzle'],
    [61, 'rain'],
    [63, 'rain'],
    [65, 'heavyRain'],
    [66, 'freezingRain'],
    [71, 'snow'],
    [75, 'snow'],
    [77, 'snowGrains'],
    [80, 'rainShowers'],
    [82, 'heavyRain'],
    [85, 'snowShowers'],
    [95, 'thunderstorm'],
    [96, 'thunderstormHail'],
    [99, 'thunderstormHail'],
  ] as const)('maps WMO %i to %s', (code, condition) => {
    expect(conditionFromWmoCode(code)).toBe(condition);
  });

  it('reports missing, unknown or malformed codes as unknown instead of guessing', () => {
    expect(conditionFromWmoCode(null)).toBe('unknown');
    expect(conditionFromWmoCode(undefined)).toBe('unknown');
    expect(conditionFromWmoCode(4)).toBe('unknown');
    expect(conditionFromWmoCode(100)).toBe('unknown');
    expect(conditionFromWmoCode(61.5)).toBe('unknown');
    expect(conditionFromWmoCode(-1)).toBe('unknown');
  });
});
