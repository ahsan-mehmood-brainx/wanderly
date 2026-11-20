import { expenseInput } from '@/testing/budgetFixtures';

import { type ExpenseCategory, type ExpenseInput, type PaymentMethod } from './Expense';
import { validateExpenseInput } from './expenseValidation';

function fieldErrors(overrides: Partial<ExpenseInput>) {
  const result = validateExpenseInput(expenseInput(overrides));
  return result.ok ? {} : result.errors.fields;
}

describe('validateExpenseInput', () => {
  it('turns valid input into a draft with trimmed text and an integer amount in minor units', () => {
    const result = validateExpenseInput(
      expenseInput({ title: '  Dinner at Ramiro  ', amount: '45.50', notes: '  Shared with Ana ' }),
    );

    expect(result).toEqual({
      ok: true,
      draft: {
        title: 'Dinner at Ramiro',
        amount: 4550,
        currency: 'USD',
        category: 'food',
        date: '2027-06-12',
        paymentMethod: 'card',
        notes: 'Shared with Ana',
        manualRate: null,
      },
    });
  });

  it.each([
    ['USD', '45.5', 4550],
    ['USD', '45,50', 4550],
    ['JPY', '1500', 1500],
    ['KWD', '1.234', 1234],
    ['USD', '1000000', 100_000_000],
  ])('reads %s %p as %d minor units', (currency, amount, minor) => {
    const result = validateExpenseInput(expenseInput({ currency, amount }));
    expect(result.ok && result.draft.amount).toBe(minor);
    expect(result.ok && Number.isInteger(result.draft.amount)).toBe(true);
  });

  describe('title', () => {
    it.each([
      ['empty', '', 'required'],
      ['only spaces', '   ', 'required'],
      ['over 80 characters', 'x'.repeat(81), 'tooLong'],
    ])('rejects a title that is %s', (_name, title, error) => {
      expect(fieldErrors({ title })).toEqual({ title: error });
    });

    it('accepts exactly 80 characters', () => {
      expect(validateExpenseInput(expenseInput({ title: 'x'.repeat(80) })).ok).toBe(true);
    });
  });

  describe('amount', () => {
    it.each([
      ['empty', '', 'required'],
      ['not a number', 'abc', 'invalidAmount'],
      ['negative', '-5', 'notPositive'],
      ['zero', '0', 'notPositive'],
      ['zero with decimals', '0.00', 'notPositive'],
      ['too many decimals for USD', '12.345', 'tooManyDecimals'],
      ['over 1,000,000', '1000000.01', 'tooLarge'],
      ['far too large', '9'.repeat(40), 'tooLarge'],
      ['with thousands separators', '1,500.00', 'invalidAmount'],
    ])('rejects an amount that is %s', (_name, amount, error) => {
      expect(fieldErrors({ amount })).toEqual({ amount: error });
    });

    it('rejects decimals for a currency without minor units', () => {
      expect(fieldErrors({ currency: 'JPY', amount: '1.5' })).toEqual({ amount: 'tooManyDecimals' });
    });
  });

  describe('currency', () => {
    it.each([
      ['an unknown code', 'XYZ'],
      ['lower case', 'usd'],
      ['too long', 'DOLLAR'],
      ['a valid code that is not offered', 'SEK'],
    ])('rejects %s', (_name, currency) => {
      expect(fieldErrors({ currency })).toEqual({ currency: 'invalid' });
    });

    it('requires a currency', () => {
      expect(fieldErrors({ currency: '' })).toEqual({ currency: 'required' });
    });

    it.each(['EUR', 'JPY', 'GBP', 'AED', 'PKR'])('accepts the offered currency %s', (currency) => {
      expect(validateExpenseInput(expenseInput({ currency, amount: '100' })).ok).toBe(true);
    });
  });

  describe('category and payment method', () => {
    it('requires a category and rejects an unknown one', () => {
      expect(fieldErrors({ category: null })).toEqual({ category: 'required' });
      expect(fieldErrors({ category: 'nightlife' as ExpenseCategory })).toEqual({ category: 'invalid' });
    });

    it.each(['food', 'transport', 'accommodation', 'shopping', 'entertainment', 'activities', 'healthcare', 'other'])(
      'accepts the category %s',
      (category) => {
        expect(validateExpenseInput(expenseInput({ category: category as ExpenseCategory })).ok).toBe(true);
      },
    );

    it('requires a payment method and rejects an unknown one', () => {
      expect(fieldErrors({ paymentMethod: null })).toEqual({ paymentMethod: 'required' });
      expect(fieldErrors({ paymentMethod: 'crypto' as PaymentMethod })).toEqual({ paymentMethod: 'invalid' });
    });
  });

  describe('date and notes', () => {
    it.each([
      ['missing', null, 'required'],
      ['not on the calendar', '2027-02-30', 'invalid'],
      ['not a date', 'yesterday', 'invalid'],
    ])('rejects a date that is %s', (_name, date, error) => {
      expect(fieldErrors({ date })).toEqual({ date: error });
    });

    it('accepts a date outside the trip and in the future', () => {
      expect(validateExpenseInput(expenseInput({ date: '2026-12-01' })).ok).toBe(true);
      expect(validateExpenseInput(expenseInput({ date: '2030-01-01' })).ok).toBe(true);
    });

    it('rejects notes over 2000 characters', () => {
      expect(fieldErrors({ notes: 'n'.repeat(2001) })).toEqual({ notes: 'tooLong' });
      expect(validateExpenseInput(expenseInput({ notes: 'n'.repeat(2000) })).ok).toBe(true);
    });
  });

  describe('manual rate', () => {
    it('keeps a typed rate as a normalised decimal string', () => {
      const result = validateExpenseInput(expenseInput({ currency: 'EUR', manualRate: ' 1,0805 ' }));
      expect(result.ok && result.draft.manualRate).toBe('1.0805');
    });

    it.each(['abc', '0', '-1'])('rejects the rate %p', (manualRate) => {
      expect(fieldErrors({ currency: 'EUR', manualRate })).toEqual({ manualRate: 'invalid' });
    });

    it('rejects a rate above one million (a mistyped rate with extra zeros)', () => {
      expect(fieldErrors({ currency: 'EUR', manualRate: '1000000.01' })).toEqual({ manualRate: 'tooLarge' });
      expect(fieldErrors({ currency: 'EUR', manualRate: '108050000000' })).toEqual({ manualRate: 'tooLarge' });
      expect(validateExpenseInput(expenseInput({ currency: 'EUR', manualRate: '1000000' })).ok).toBe(true);
    });
  });

  it('reports every invalid field at once', () => {
    expect(fieldErrors({ title: '', amount: '-5', category: null, date: null })).toEqual({
      title: 'required',
      amount: 'notPositive',
      category: 'required',
      date: 'required',
    });
  });
});
