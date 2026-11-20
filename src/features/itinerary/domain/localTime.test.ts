import { durationMinutes, formatLocalTime, isLocalTime, parseLocalTime, toMinutes } from './localTime';

describe('parseLocalTime', () => {
  it.each([
    ['00:00', { hour: 0, minute: 0 }],
    ['09:05', { hour: 9, minute: 5 }],
    ['23:59', { hour: 23, minute: 59 }],
  ])('reads %s', (value, parts) => {
    expect(parseLocalTime(value)).toEqual(parts);
    expect(isLocalTime(value)).toBe(true);
  });

  it.each(['24:00', '12:60', '9:00', '09:5', '0900', ' 09:00', '09:00:00', '', null, 540, undefined])(
    'rejects %p',
    (value) => {
      expect(parseLocalTime(value)).toBeNull();
      expect(isLocalTime(value)).toBe(false);
    },
  );
});

describe('formatLocalTime / toMinutes', () => {
  it('pads to HH:mm', () => {
    expect(formatLocalTime({ hour: 7, minute: 5 })).toBe('07:05');
  });

  it('counts minutes since midnight', () => {
    expect(toMinutes('00:00')).toBe(0);
    expect(toMinutes('10:30')).toBe(630);
    expect(toMinutes('23:59')).toBe(1439);
  });
});

describe('durationMinutes', () => {
  it('measures a timed activity', () => {
    expect(durationMinutes('09:00', '10:30')).toBe(90);
    expect(durationMinutes('00:00', '23:59')).toBe(1439);
  });

  it('is null without both times or when the end is not later', () => {
    expect(durationMinutes('09:00', null)).toBeNull();
    expect(durationMinutes(null, '10:00')).toBeNull();
    expect(durationMinutes(null, null)).toBeNull();
    expect(durationMinutes('10:00', '10:00')).toBeNull();
    expect(durationMinutes('10:00', '09:00')).toBeNull();
  });
});
