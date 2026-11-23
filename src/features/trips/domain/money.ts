import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES } from '@/core/money/currencies';

/** Currencies offered in the trip form. Any valid ISO 4217 code is accepted from storage. */
export const TRIP_CURRENCIES = SUPPORTED_CURRENCIES;

export const DEFAULT_TRIP_CURRENCY = DEFAULT_CURRENCY;

const CURRENCY_CODE = /^[A-Z]{3}$/;

export function isCurrencyCode(value: unknown): value is string {
  return typeof value === 'string' && CURRENCY_CODE.test(value);
}

/**
 * ISO 4217 minor-unit digits that differ from the usual 2. Kept as data rather
 * than read from `Intl`, because the amount stored must not depend on which ICU
 * data the device's JavaScript engine ships.
 */
const FRACTION_DIGITS: Readonly<Record<string, number>> = {
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  UYI: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
};

/** Digits after the decimal point for the currency (2 for USD, 0 for JPY, 3 for KWD). */
export function currencyFractionDigits(currency: string): number {
  return FRACTION_DIGITS[currency] ?? 2;
}

export type AmountParseError = 'required' | 'invalidAmount' | 'tooManyDecimals' | 'notPositive' | 'tooLarge';

export type ParsedAmount =
  { readonly ok: true; readonly minor: number } | { readonly ok: false; readonly error: AmountParseError };

const AMOUNT = /^(\d+)(?:[.,](\d*))?$/;

/**
 * Turns a typed amount into minor units. Accepts `.` or `,` as the decimal
 * separator (keyboards show the locale's), and no thousands separators, so
 * `1,500` is never taken for fifteen hundred (in USD it has too many decimals). Spaces are ignored.
 * The amount must be positive, have at most the currency's decimal places and
 * not exceed `maxMajor`.
 */
export function parseAmount(text: string, currency: string, maxMajor: number): ParsedAmount {
  const compact = text.replace(/\s+/g, '');
  if (!compact) return { ok: false, error: 'required' };
  const match = AMOUNT.exec(compact);
  if (!match) return { ok: false, error: 'invalidAmount' };

  const whole = match[1] ?? '0';
  const fraction = match[2] ?? '';
  const digits = currencyFractionDigits(currency);
  if (fraction.length > digits) return { ok: false, error: 'tooManyDecimals' };

  // Compare as numbers only after checking the length, so a 400-digit string never overflows.
  const wholeDigits = whole.replace(/^0+(?=\d)/, '');
  if (wholeDigits.length > String(maxMajor).length || Number(wholeDigits) > maxMajor) {
    return { ok: false, error: 'tooLarge' };
  }
  const minor = Number(wholeDigits) * 10 ** digits + Number(fraction.padEnd(digits, '0') || '0');
  if (minor <= 0) return { ok: false, error: 'notPositive' };
  if (minor > maxMajor * 10 ** digits) return { ok: false, error: 'tooLarge' };
  return { ok: true, minor };
}

/** Minor units back to editable text (`150075` USD → `1500.75`; `5000` JPY → `5000`). */
export function formatAmountInput(minor: number, currency: string): string {
  const digits = currencyFractionDigits(currency);
  if (digits === 0) return String(minor);
  const whole = Math.floor(minor / 10 ** digits);
  const fraction = String(minor % 10 ** digits).padStart(digits, '0');
  return /^0+$/.test(fraction) ? String(whole) : `${whole}.${fraction}`;
}

/** Minor units as a major-unit number for `Intl.NumberFormat` display. */
export function minorToMajor(minor: number, currency: string): number {
  return minor / 10 ** currencyFractionDigits(currency);
}
