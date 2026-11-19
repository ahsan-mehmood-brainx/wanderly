import { createI18n } from '@/core/i18n/createI18n';

import { formatActivityTime, formatDayDate, formatDayLabel, formatTime, formatTimeRange } from './format';

const { t } = createI18n('en');

describe('itinerary formatting edge cases', () => {
  it('shows midnight and the last five minutes of the day in 12- and 24-hour locales', () => {
    expect(formatTime('00:00', 'en-US')).toMatch(/^12:00\sAM$/);
    expect(formatTime('23:55', 'en-US')).toMatch(/^11:55\sPM$/);
    expect(formatTime('00:00', 'en-GB')).toBe('0:00');
    expect(formatTime('23:55', 'es')).toBe('23:55');
  });

  it('falls back to the stored HH:mm text when the language tag is not a valid locale', () => {
    expect(formatTime('09:30', 'not a locale!')).toBe('09:30');
    expect(formatTimeRange('09:30', '10:00', 'not a locale!')).toBe('09:30 – 10:00');
  });

  it('shows a stored end time that is not after its start without a duration', () => {
    expect(formatActivityTime({ startTime: '10:00', endTime: '09:00' }, 'en-GB', t)).toBe('10:00 – 9:00');
  });

  it('shows the same trip day whatever the device time zone, across a year end', () => {
    expect(formatDayLabel('2027-12-31', 3, 'en-US', t)).toBe('Day 3 · Fri, Dec 31');
    expect(formatDayLabel('2028-01-01', 4, 'en-US', t)).toBe('Day 4 · Sat, Jan 1');
  });

  it('falls back to the ISO date for an invalid language, every time it is asked', () => {
    expect(formatDayDate('2027-07-01', 'not a locale!')).toBe('2027-07-01');
    expect(formatDayDate('2027-07-02', 'not a locale!')).toBe('2027-07-02');
    expect(formatDayDate('2027-07-01', 'en-US')).toBe('Thu, Jul 1');
  });
});
