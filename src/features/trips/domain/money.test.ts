import { currencyFractionDigits, formatAmountInput, isCurrencyCode, minorToMajor, parseAmount } from './money';

const MAX = 10_000_000;

describe('parseAmount', () => {
  it.each([
    ['1500', 'USD', 150_000],
    ['1500.5', 'USD', 150_050],
    ['1500,75', 'EUR', 150_075],
    ['0.01', 'USD', 1],
    ['19.99', 'USD', 1999],
    ['1.10', 'USD', 110],
    ['7.', 'USD', 700],
    [' 1 500 ', 'USD', 150_000],
    ['007', 'USD', 700],
    ['5000', 'JPY', 5000],
    ['1.234', 'KWD', 1234],
    ['10000000', 'USD', 1_000_000_000],
  ])('reads %s %s as %i minor units', (text, currency, minor) => {
    expect(parseAmount(text, currency, MAX)).toEqual({ ok: true, minor });
  });

  it.each([
    ['', 'required'],
    ['   ', 'required'],
    ['abc', 'invalidAmount'],
    ['-5', 'invalidAmount'],
    ['+5', 'invalidAmount'],
    ['1e5', 'invalidAmount'],
    ['1.2.3', 'invalidAmount'],
    ['.5', 'invalidAmount'],
    ['Infinity', 'invalidAmount'],
    ['1,500', 'tooManyDecimals'],
    ['1.999', 'tooManyDecimals'],
    ['0', 'notPositive'],
    ['0.00', 'notPositive'],
    ['10000000.01', 'tooLarge'],
    ['10000001', 'tooLarge'],
    ['9'.repeat(400), 'tooLarge'],
  ])('rejects "%s" as %s', (text, error) => {
    expect(parseAmount(text, 'USD', MAX)).toEqual({ ok: false, error });
  });

  it('rejects decimals in a currency without them', () => {
    expect(parseAmount('10.5', 'JPY', MAX)).toEqual({ ok: false, error: 'tooManyDecimals' });
  });

  it('keeps exact cents where floating point would drift', () => {
    expect(parseAmount('1.15', 'USD', MAX)).toEqual({ ok: true, minor: 115 });
    expect(parseAmount('4.35', 'USD', MAX)).toEqual({ ok: true, minor: 435 });
  });
});

describe('formatting amounts', () => {
  it.each([
    [150_000, 'USD', '1500'],
    [150_075, 'USD', '1500.75'],
    [150_050, 'USD', '1500.50'],
    [5, 'USD', '0.05'],
    [5000, 'JPY', '5000'],
    [1234, 'KWD', '1.234'],
  ])('%i %s edits as %s and parses back', (minor, currency, text) => {
    expect(formatAmountInput(minor, currency)).toBe(text);
    expect(parseAmount(text, currency, MAX)).toEqual({ ok: true, minor });
  });

  it('converts to major units per currency', () => {
    expect(minorToMajor(1999, 'USD')).toBe(19.99);
    expect(minorToMajor(500, 'JPY')).toBe(500);
  });
});

describe('currencies', () => {
  it('knows the decimal places', () => {
    expect(currencyFractionDigits('USD')).toBe(2);
    expect(currencyFractionDigits('JPY')).toBe(0);
    expect(currencyFractionDigits('KWD')).toBe(3);
  });

  it.each([['usd'], ['US'], ['USDT'], [''], [1]])('rejects %s as a code', (value) => {
    expect(isCurrencyCode(value)).toBe(false);
  });
});
