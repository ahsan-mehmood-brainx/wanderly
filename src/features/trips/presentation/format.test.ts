import { createI18n } from '@/core/i18n/createI18n';

import { fieldErrorMessage, formatBudget, formatTripDate, formatTripDates, timelineLabel } from './format';

const { t } = createI18n('en');

describe('dates', () => {
  it('shows the calendar date unchanged, whatever the device zone', () => {
    expect(formatTripDate('2027-01-01', 'en-US')).toBe('Jan 1, 2027');
  });

  it('shortens a range within one year and keeps both years across two', () => {
    expect(formatTripDates('2027-03-12', '2027-04-03', 'en-US')).toBe('Mar 12 – Apr 3, 2027');
    expect(formatTripDates('2027-12-30', '2028-01-02', 'en-US')).toBe('Dec 30, 2027 – Jan 2, 2028');
    expect(formatTripDates('2027-03-12', '2027-03-12', 'en-US')).toBe('Mar 12, 2027');
  });

  it('falls back to the raw date for an unusable locale', () => {
    expect(formatTripDate('2027-01-01', 'not a locale!')).toBe('2027-01-01');
  });
});

describe('formatBudget', () => {
  it('uses each currency’s decimals', () => {
    expect(formatBudget(150_075, 'USD', 'en-US')).toBe('$1,500.75');
    expect(formatBudget(5000, 'JPY', 'en-US')).toBe('¥5,000');
  });

  it('falls back when the currency is unknown to the engine', () => {
    expect(formatBudget(1050, 'USD', 'not a locale!')).toBe('10.50 USD');
  });
});

describe('timelineLabel', () => {
  it.each([
    [{ kind: 'startsIn', days: 1 } as const, 'Starts tomorrow'],
    [{ kind: 'startsIn', days: 5 } as const, 'Starts in 5 days'],
    [{ kind: 'inProgress', day: 2, of: 7 } as const, 'Day 2 of 7'],
    [{ kind: 'endedAgo', days: 1 } as const, 'Ended yesterday'],
    [{ kind: 'endedAgo', days: 9 } as const, 'Ended 9 days ago'],
    [{ kind: 'cancelled' } as const, 'Cancelled'],
  ])('%j', (timeline, label) => expect(timelineLabel(timeline, t)).toBe(label));
});

describe('fieldErrorMessage', () => {
  const message = (field: Parameters<typeof fieldErrorMessage>[0], code: never, currency = 'USD') =>
    fieldErrorMessage(field, { fields: { [field]: code } }, currency, 'en-US', t);

  it('is empty without an error', () => {
    expect(fieldErrorMessage('title', null, 'USD', 'en-US', t)).toBeUndefined();
    expect(fieldErrorMessage('title', { fields: {} }, 'USD', 'en-US', t)).toBeUndefined();
  });

  it('names the conflicting trip and its dates', () => {
    expect(
      fieldErrorMessage(
        'dates',
        {
          fields: { dates: 'overlap' },
          conflict: { id: 'x', title: 'Rome', startDate: '2027-07-01', endDate: '2027-07-03' },
        },
        'USD',
        'en-US',
        t,
      ),
    ).toBe('These dates overlap "Rome" (Jul 1 – Jul 3, 2027).');
  });

  it('explains decimals for the chosen currency', () => {
    expect(message('budget', 'tooManyDecimals' as never)).toBe('Use at most 2 decimal places.');
    expect(message('budget', 'tooManyDecimals' as never, 'JPY')).toBe('JPY amounts have no decimals.');
  });

  it.each([
    ['title', 'required', 'Give your trip a name.'],
    ['destination', 'required', 'Choose a destination.'],
    ['dates', 'required', 'Choose the start and end dates.'],
    ['dates', 'endBeforeStart', "The end date can't be before the start date."],
    ['budget', 'required', 'Enter a budget.'],
    ['budget', 'notPositive', 'The budget must be more than zero.'],
    ['budget', 'tooLarge', 'That budget is too large.'],
  ] as const)('%s / %s', (field, code, text) => expect(message(field, code as never)).toBe(text));
});
