/**
 * Currencies the app offers for selection (trip form, currency preference).
 * Shared by features so app-wide preferences don't depend on the trips feature.
 */
export const SUPPORTED_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'AED',
  'AUD',
  'BRL',
  'CAD',
  'CHF',
  'CNY',
  'INR',
  'JPY',
  'KRW',
  'MXN',
  'NZD',
  'PKR',
  'SAR',
  'SGD',
  'THB',
  'TRY',
  'ZAR',
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const DEFAULT_CURRENCY: SupportedCurrency = 'USD';
