import { activity, activityInput } from '@/testing/itineraryFixtures';

import { type Activity, ACTIVITY_LIMITS, type ActivityInput } from './Activity';
import { validateActivityInput } from './activityValidation';

const trip = { startDate: '2027-07-01', endDate: '2027-07-05' };

function validate(overrides: Partial<ActivityInput> = {}, sameDay: readonly Activity[] = [], excludeId?: string) {
  return validateActivityInput(activityInput(overrides), { trip, sameDay, excludeId });
}

function fieldErrors(overrides: Partial<ActivityInput>, sameDay: readonly Activity[] = []) {
  const result = validate(overrides, sameDay);
  return result.ok ? null : result.errors.fields;
}

describe('validateActivityInput', () => {
  it('accepts a complete activity and returns trimmed text with the cost in minor units', () => {
    const result = validate({
      title: '  Lunch at Time Out  ',
      description: ' Market hall ',
      category: 'food',
      date: '2027-07-02',
      startTime: '09:00',
      endTime: '10:30',
      latitude: 38.707,
      longitude: -9.146,
      address: ' Av. 24 de Julho ',
      estimatedCost: '25.50',
      currency: 'USD',
      notes: ' Book ahead ',
    });

    expect(result).toEqual({
      ok: true,
      draft: {
        title: 'Lunch at Time Out',
        description: 'Market hall',
        category: 'food',
        date: '2027-07-02',
        startTime: '09:00',
        endTime: '10:30',
        latitude: 38.707,
        longitude: -9.146,
        address: 'Av. 24 de Julho',
        estimatedCost: 2550,
        currency: 'USD',
        notes: 'Book ahead',
      },
    });
  });

  it('accepts an untimed activity without a cost or place', () => {
    const result = validate({ startTime: null, endTime: null, estimatedCost: '  ' });
    expect(result).toMatchObject({ ok: true, draft: { startTime: null, endTime: null, estimatedCost: null } });
  });

  it('accepts a start time without an end time', () => {
    expect(validate({ startTime: '20:00', endTime: null }).ok).toBe(true);
  });

  describe('title', () => {
    it.each([
      ['empty', '', 'required'],
      ['blank', '   ', 'required'],
      ['over 80 characters', 'x'.repeat(ACTIVITY_LIMITS.titleMaxLength + 1), 'tooLong'],
    ])('refuses a title that is %s', (_name, title, error) => {
      expect(fieldErrors({ title })).toEqual({ title: error });
    });

    it('accepts exactly 80 characters', () => {
      expect(validate({ title: 'x'.repeat(ACTIVITY_LIMITS.titleMaxLength) }).ok).toBe(true);
    });
  });

  it('requires a known category', () => {
    expect(fieldErrors({ category: null })).toEqual({ category: 'required' });
    expect(fieldErrors({ category: 'nightlife' as ActivityInput['category'] })).toEqual({ category: 'invalid' });
  });

  describe('date', () => {
    it('requires a day', () => {
      expect(fieldErrors({ date: null })).toEqual({ date: 'required' });
    });

    it('refuses a malformed date', () => {
      expect(fieldErrors({ date: '2027-02-30' })).toEqual({ date: 'invalid' });
    });

    it.each(['2027-06-30', '2027-07-06'])('refuses %s, outside the trip', (date) => {
      expect(fieldErrors({ date })).toEqual({ date: 'outsideTrip' });
    });

    it.each(['2027-07-01', '2027-07-05'])('accepts %s, on the trip edge', (date) => {
      expect(validate({ date }).ok).toBe(true);
    });

    it('refuses a day that already holds the maximum number of activities', () => {
      const full = Array.from({ length: ACTIVITY_LIMITS.maxActivitiesPerDay }, (_, index) =>
        activity({ id: `a${index}`, title: `Stop ${index}`, sortOrder: index }),
      );
      expect(fieldErrors({ title: 'One more' }, full)).toEqual({ date: 'dayFull' });
    });

    it('does not count the activity being edited towards a full day', () => {
      const full = Array.from({ length: ACTIVITY_LIMITS.maxActivitiesPerDay }, (_, index) =>
        activity({ id: `a${index}`, title: `Stop ${index}`, sortOrder: index }),
      );
      expect(validate({ title: 'Renamed stop' }, full, 'a3').ok).toBe(true);
    });
  });

  describe('times', () => {
    it('refuses an end time without a start time', () => {
      expect(fieldErrors({ startTime: null, endTime: '10:00' })).toEqual({ endTime: 'endWithoutStart' });
    });

    it.each([
      ['equal to', '10:00'],
      ['before', '09:59'],
    ])('refuses an end time %s the start time', (_name, endTime) => {
      expect(fieldErrors({ startTime: '10:00', endTime })).toEqual({ endTime: 'invalidRange' });
    });

    it('refuses malformed times', () => {
      expect(fieldErrors({ startTime: '25:00', endTime: null })).toEqual({ startTime: 'invalid' });
      expect(fieldErrors({ startTime: '09:00', endTime: '9:30' })).toEqual({ endTime: 'invalid' });
    });
  });

  describe('cost', () => {
    it.each([
      ['abc', 'invalidAmount'],
      ['1,500', 'tooManyDecimals'],
      ['12.345', 'tooManyDecimals'],
      ['0', 'notPositive'],
      ['1000000.01', 'tooLarge'],
    ])('refuses %s', (estimatedCost, error) => {
      expect(fieldErrors({ estimatedCost })).toEqual({ cost: error });
    });

    it('accepts the maximum and follows the currency’s decimals', () => {
      expect(validate({ estimatedCost: '1000000' })).toMatchObject({ ok: true, draft: { estimatedCost: 100_000_000 } });
      expect(fieldErrors({ estimatedCost: '10.5', currency: 'JPY' })).toEqual({ cost: 'tooManyDecimals' });
      expect(validate({ estimatedCost: '1500', currency: 'JPY' })).toMatchObject({ draft: { estimatedCost: 1500 } });
    });

    it('refuses an invalid currency', () => {
      expect(fieldErrors({ estimatedCost: '10', currency: 'usd' })).toEqual({ currency: 'invalid' });
    });
  });

  describe('location', () => {
    it.each([
      ['only a latitude', { latitude: 38.7, longitude: null }],
      ['only a longitude', { latitude: null, longitude: -9.1 }],
      ['a latitude out of range', { latitude: 91, longitude: 0 }],
      ['a longitude out of range', { latitude: 0, longitude: -180.5 }],
      ['a coordinate that is not a number', { latitude: Number.NaN, longitude: 0 }],
    ])('refuses %s', (_name, coordinates) => {
      expect(fieldErrors(coordinates)).toEqual({ location: 'invalidLocation' });
    });

    it('accepts the extremes', () => {
      expect(validate({ latitude: -90, longitude: 180 }).ok).toBe(true);
    });
  });

  it.each([
    ['description', { description: 'x'.repeat(ACTIVITY_LIMITS.descriptionMaxLength + 1) }],
    ['notes', { notes: 'x'.repeat(ACTIVITY_LIMITS.notesMaxLength + 1) }],
    ['address', { address: 'x'.repeat(ACTIVITY_LIMITS.addressMaxLength + 1) }],
  ])('limits the length of the %s', (field, overrides) => {
    expect(fieldErrors(overrides)).toEqual({ [field]: 'tooLong' });
  });

  it('reports every invalid field at once', () => {
    expect(
      fieldErrors({ title: '', category: null, startTime: '11:00', endTime: '10:00', estimatedCost: 'x' }),
    ).toEqual({
      title: 'required',
      category: 'required',
      endTime: 'invalidRange',
      cost: 'invalidAmount',
    });
  });

  describe('duplicates', () => {
    const existing = activity({ id: 'tower', title: 'Belém Tower', startTime: '09:00', endTime: '10:30' });

    it('refuses the same title (trimmed, any case) at the same start time and names the existing one', () => {
      const result = validate({ title: '  belém TOWER ', startTime: '09:00', endTime: '11:00' }, [existing]);
      expect(result).toEqual({
        ok: false,
        errors: {
          fields: { title: 'duplicate' },
          duplicate: { id: 'tower', title: 'Belém Tower', date: '2027-07-01', startTime: '09:00' },
        },
      });
    });

    it('treats two untimed activities with the same title as duplicates', () => {
      const untimed = activity({ id: 'walk', title: 'Walk', startTime: null, endTime: null });
      expect(fieldErrors({ title: 'Walk', startTime: null, endTime: null }, [untimed])).toEqual({ title: 'duplicate' });
    });

    it('allows the same title at another time', () => {
      expect(validate({ startTime: '15:00', endTime: '16:00' }, [existing]).ok).toBe(true);
    });

    it('does not count the activity being edited as its own duplicate', () => {
      expect(validate({}, [existing], 'tower').ok).toBe(true);
    });
  });

  it('allows overlapping times (they are only warned about)', () => {
    const lunch = activity({ id: 'lunch', title: 'Lunch', startTime: '10:00', endTime: '11:30' });
    expect(validate({ startTime: '09:00', endTime: '10:30' }, [lunch]).ok).toBe(true);
  });
});
