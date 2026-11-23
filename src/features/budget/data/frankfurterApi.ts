import { type ApiDefinition, ExponentialBackoffRetry } from '@/core/http';

/**
 * Frankfurter exchange rates (https://frankfurter.dev), published by the European
 * Central Bank. No key. Historical rates never change, so they are cached for good.
 */
export const FRANKFURTER_API: ApiDefinition = {
  name: 'frankfurter',
  baseUrl: 'https://api.frankfurter.dev/v1',
  timeoutMs: 10_000,
  retry: new ExponentialBackoffRetry({ maxRetries: 1 }),
};

export const LATEST_PATH = '/latest';
export const CURRENCIES_PATH = '/currencies';

/** `/2027-03-14` for a historical rate. */
export const historicalPath = (date: string) => `/${date}`;
