import { createBudgetStorage } from '@/testing/budgetFixtures';

import { type CachedRate, LATEST_RATE } from './LocalExchangeRateCache';

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw result.error;
  return result.value;
};

const rate = (overrides: Partial<CachedRate> = {}): CachedRate => ({
  base: 'EUR',
  quote: 'USD',
  requestedDate: '2027-06-12',
  rate: '1.0805',
  rateDate: '2027-06-12',
  fetchedAt: 1_000,
  ...overrides,
});

describe('LocalExchangeRateCache', () => {
  it('saves a rate and reads it back by pair and requested date', async () => {
    const { rateCache } = createBudgetStorage();

    expect((await rateCache.save(rate())).ok).toBe(true);

    expect(unwrap(await rateCache.get('EUR', 'USD', '2027-06-12'))).toEqual(rate());
    expect(unwrap(await rateCache.get('USD', 'EUR', '2027-06-12'))).toBeNull();
    expect(unwrap(await rateCache.get('EUR', 'USD', '2027-06-13'))).toBeNull();
  });

  it('keeps the rate date the source reported, which can differ from the requested date', async () => {
    const { rateCache } = createBudgetStorage();
    await rateCache.save(rate({ requestedDate: '2027-06-13', rateDate: '2027-06-11' }));

    expect(unwrap(await rateCache.get('EUR', 'USD', '2027-06-13'))?.rateDate).toBe('2027-06-11');
  });

  it('keeps the latest rate under its own key and replaces it when saved again', async () => {
    const { rateCache } = createBudgetStorage();
    await rateCache.save(rate({ requestedDate: LATEST_RATE, rate: '1.07', rateDate: '2027-06-14', fetchedAt: 1 }));
    await rateCache.save(rate({ requestedDate: LATEST_RATE, rate: '1.09', rateDate: '2027-06-15', fetchedAt: 2 }));

    expect(unwrap(await rateCache.get('EUR', 'USD', LATEST_RATE))).toEqual(
      rate({ requestedDate: LATEST_RATE, rate: '1.09', rateDate: '2027-06-15', fetchedAt: 2 }),
    );
  });

  it('finds the nearest cached rate on or before a date for the same pair', async () => {
    const { rateCache } = createBudgetStorage();
    await rateCache.save(rate({ requestedDate: '2027-06-01', rateDate: '2027-06-01', rate: '1.01' }));
    await rateCache.save(rate({ requestedDate: '2027-06-10', rateDate: '2027-06-10', rate: '1.10' }));
    await rateCache.save(rate({ requestedDate: '2027-06-20', rateDate: '2027-06-20', rate: '1.20' }));
    await rateCache.save(rate({ base: 'GBP', requestedDate: '2027-06-11', rateDate: '2027-06-11', rate: '1.30' }));

    expect(unwrap(await rateCache.nearestBefore('EUR', 'USD', '2027-06-12'))?.rate).toBe('1.10');
    expect(unwrap(await rateCache.nearestBefore('EUR', 'USD', '2027-06-10'))?.rate).toBe('1.10');
    expect(unwrap(await rateCache.nearestBefore('EUR', 'USD', '2027-05-31'))).toBeNull();
    expect(unwrap(await rateCache.nearestBefore('JPY', 'USD', '2027-06-12'))).toBeNull();
  });

  it('turns database failures into storage errors instead of throwing', async () => {
    const { rateCache, handle } = createBudgetStorage();
    handle.failOpens = 1;
    const result = await rateCache.get('EUR', 'USD', '2027-06-12');
    expect(!result.ok && result.error.kind).toBe('storage');
  });
});
