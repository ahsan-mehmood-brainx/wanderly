import { createI18n } from '@/core/i18n/createI18n';

import { activityFieldError, formatActivityTime, formatDayLabel, formatDuration, formatTime } from './format';

const { t } = createI18n('en');

describe('itinerary formatting', () => {
  it('formats wall-clock times by locale, never shifted by the device time zone', () => {
    expect(formatTime('09:05', 'en-US')).toMatch(/^9:05\sAM$/);
    expect(formatTime('21:30', 'en-GB')).toBe('21:30');
    expect(formatTime('not a time', 'en-US')).toBe('not a time');
  });

  it('formats durations in hours and minutes', () => {
    expect(formatDuration(45, t)).toBe('45 min');
    expect(formatDuration(120, t)).toBe('2 h');
    expect(formatDuration(90, t)).toBe('1 h 30 min');
  });

  it('describes timed, start-only and untimed activities', () => {
    expect(formatActivityTime({ startTime: '09:00', endTime: '10:30' }, 'en-GB', t)).toBe('9:00 – 10:30 · 1 h 30 min');
    expect(formatActivityTime({ startTime: '20:00', endTime: null }, 'en-GB', t)).toBe('20:00');
    expect(formatActivityTime({ startTime: null, endTime: null }, 'en-GB', t)).toBe('Any time');
  });

  it('labels trip days with their number, and other days with the date alone', () => {
    expect(formatDayLabel('2027-07-01', 1, 'en-US', t)).toBe('Day 1 · Thu, Jul 1');
    expect(formatDayLabel('2027-06-28', null, 'en-US', t)).toBe('Mon, Jun 28');
  });

  it('explains validation errors, naming a duplicate', () => {
    const errors = {
      fields: { title: 'duplicate', endTime: 'invalidRange', cost: 'tooManyDecimals' },
      duplicate: { id: 'tower', title: 'Belém Tower', date: '2027-07-01', startTime: '09:00' },
    } as const;
    expect(activityFieldError('title', errors, 'USD', 'en-GB', t)).toBe(
      'You already have "Belém Tower" at 9:00 on this day.',
    );
    expect(activityFieldError('endTime', errors, 'USD', 'en-GB', t)).toBe('The end time must be after the start time.');
    expect(activityFieldError('cost', errors, 'JPY', 'en-GB', t)).toBe('JPY amounts have no decimals.');
    expect(activityFieldError('notes', errors, 'USD', 'en-GB', t)).toBeUndefined();
  });
});
