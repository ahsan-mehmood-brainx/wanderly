import { APP_MIGRATIONS } from '@/bootstrap/databaseMigrations';
import { SqliteDatabase } from '@/core/database/SqliteDatabase';
import { type SqlParams } from '@/core/database/SqlDatabase';
import { LocalActivityRepository } from '@/features/itinerary/data/LocalActivityRepository';
import { LocalTripRepository } from '@/features/trips/data/LocalTripRepository';
import {
  BUDGET_TRIP,
  createBudgetStorage,
  euroExpense,
  expense,
  seededBudgetDatabase,
  unconvertedExpense,
} from '@/testing/budgetFixtures';
import { activity } from '@/testing/itineraryFixtures';
import { createNodeSqliteEngine, nodeSqliteDriver } from '@/testing/nodeSqliteDriver';
import { createTestLogger } from '@/testing/testDependencies';
import { OTHER_TRIP_OWNER, storedTrip, TRIP_OWNER } from '@/testing/tripFixtures';

import { type Expense } from '../domain/Expense';
import { LocalExpenseRepository } from './LocalExpenseRepository';

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw result.error;
  return result.value;
};

const ids = async (repository: LocalExpenseRepository, tripId = 'trip-1') =>
  unwrap(await repository.listByTrip(TRIP_OWNER, tripId)).map(({ id }) => id);

describe('LocalExpenseRepository', () => {
  it('stores and reads back every field of a converted foreign expense', async () => {
    const { expenseRepository } = await seededBudgetDatabase();
    const item = euroExpense({
      title: 'Ünï "quoted" \'title\'; DROP TABLE expenses',
      paymentMethod: 'mobileWallet',
      notes: 'Line one\nLine two',
      exchangeRate: { rate: '1.08050001', rateDate: '2027-06-11', source: 'fallback' },
      createdAt: 1,
      updatedAt: 2,
    });

    expect(await expenseRepository.insert(TRIP_OWNER, item)).toEqual({ ok: true, value: undefined });
    expect(unwrap(await expenseRepository.findById(TRIP_OWNER, item.id))).toEqual(item);
  });

  it('keeps an unconverted expense with no base amount or rate', async () => {
    const { expenseRepository } = await seededBudgetDatabase();
    const item = unconvertedExpense();

    await expenseRepository.insert(TRIP_OWNER, item);

    expect(unwrap(await expenseRepository.findById(TRIP_OWNER, item.id))).toEqual(item);
  });

  it('keeps a manual rate as typed', async () => {
    const { expenseRepository } = await seededBudgetDatabase();
    const item = euroExpense({
      exchangeRate: { rate: '1.1', rateDate: '2027-06-12', source: 'manual' },
      baseAmount: 2200,
    });

    await expenseRepository.insert(TRIP_OWNER, item);

    expect(unwrap(await expenseRepository.findById(TRIP_OWNER, item.id))?.exchangeRate).toEqual({
      rate: '1.1',
      rateDate: '2027-06-12',
      source: 'manual',
    });
  });

  it('returns null for an unknown id', async () => {
    const { expenseRepository } = await seededBudgetDatabase();
    expect(unwrap(await expenseRepository.findById(TRIP_OWNER, 'nope'))).toBeNull();
  });

  it("lists only that trip's expenses, by date then creation time", async () => {
    const { expenseRepository } = await seededBudgetDatabase(
      [BUDGET_TRIP, storedTrip({ id: 'trip-2', startDate: '2027-08-01', endDate: '2027-08-02' })],
      [
        expense({ id: 'late', date: '2027-06-13', createdAt: 1 }),
        expense({ id: 'second', date: '2027-06-11', createdAt: 20 }),
        expense({ id: 'first', date: '2027-06-11', createdAt: 10 }),
        expense({ id: 'other', tripId: 'trip-2', date: '2027-08-01' }),
      ],
    );

    await expect(ids(expenseRepository)).resolves.toEqual(['first', 'second', 'late']);
  });

  it('updates the editable fields but not the id, trip or createdAt', async () => {
    const { expenseRepository } = await seededBudgetDatabase([BUDGET_TRIP], [expense({ createdAt: 1 })]);
    const changed = euroExpense({
      id: 'exp-1',
      title: 'Taxi',
      category: 'transport',
      paymentMethod: 'cash',
      date: '2027-06-13',
      notes: 'Airport',
      updatedAt: 99,
      createdAt: 50,
    });

    expect((await expenseRepository.update(TRIP_OWNER, changed)).ok).toBe(true);
    expect(unwrap(await expenseRepository.findById(TRIP_OWNER, 'exp-1'))).toEqual({ ...changed, createdAt: 1 });
  });

  it('deletes an expense', async () => {
    const { expenseRepository } = await seededBudgetDatabase(
      [BUDGET_TRIP],
      [expense({ id: 'a' }), expense({ id: 'b' })],
    );

    expect((await expenseRepository.delete(TRIP_OWNER, 'a')).ok).toBe(true);
    await expect(ids(expenseRepository)).resolves.toEqual(['b']);
  });

  it.each(['update', 'delete'] as const)('%s of a missing expense is notFound', async (operation) => {
    const { expenseRepository } = await seededBudgetDatabase();
    const result =
      operation === 'update'
        ? await expenseRepository.update(TRIP_OWNER, expense())
        : await expenseRepository.delete(TRIP_OWNER, 'exp-1');
    expect(!result.ok && result.error.kind).toBe('notFound');
  });

  describe('updateConversions', () => {
    it('writes new base amounts for several expenses', async () => {
      const { expenseRepository } = await seededBudgetDatabase(
        [BUDGET_TRIP],
        [euroExpense({ id: 'a' }), unconvertedExpense({ id: 'b' })],
      );

      const result = await expenseRepository.updateConversions(TRIP_OWNER, [
        {
          id: 'a',
          baseCurrency: 'GBP',
          baseAmount: 1700,
          exchangeRate: { rate: '0.85', rateDate: '2027-06-12', source: 'api' },
          updatedAt: 500,
        },
        {
          id: 'b',
          baseCurrency: 'GBP',
          baseAmount: 805,
          exchangeRate: { rate: '0.00537', rateDate: '2027-06-11', source: 'fallback' },
          updatedAt: 500,
        },
      ]);

      expect(result.ok).toBe(true);
      expect(unwrap(await expenseRepository.findById(TRIP_OWNER, 'a'))).toMatchObject({
        baseCurrency: 'GBP',
        baseAmount: 1700,
        exchangeRate: { rate: '0.85', rateDate: '2027-06-12', source: 'api' },
        updatedAt: 500,
        amount: 2000,
        currency: 'EUR',
      });
      expect(unwrap(await expenseRepository.findById(TRIP_OWNER, 'b'))).toMatchObject({
        baseCurrency: 'GBP',
        baseAmount: 805,
      });
    });

    it('can mark an expense unconverted', async () => {
      const { expenseRepository } = await seededBudgetDatabase([BUDGET_TRIP], [euroExpense({ id: 'a' })]);

      await expenseRepository.updateConversions(TRIP_OWNER, [
        { id: 'a', baseCurrency: 'GBP', baseAmount: null, exchangeRate: null, updatedAt: 500 },
      ]);

      expect(unwrap(await expenseRepository.findById(TRIP_OWNER, 'a'))).toMatchObject({
        baseCurrency: 'GBP',
        baseAmount: null,
        exchangeRate: null,
      });
    });

    it('changes nothing and is notFound when one of the expenses is missing', async () => {
      const { expenseRepository } = await seededBudgetDatabase([BUDGET_TRIP], [euroExpense({ id: 'a' })]);

      const result = await expenseRepository.updateConversions(TRIP_OWNER, [
        {
          id: 'a',
          baseCurrency: 'GBP',
          baseAmount: 1700,
          exchangeRate: { rate: '0.85', rateDate: '2027-06-12', source: 'api' },
          updatedAt: 500,
        },
        {
          id: 'gone',
          baseCurrency: 'GBP',
          baseAmount: 1,
          exchangeRate: { rate: '1', rateDate: '2027-06-12', source: 'api' },
          updatedAt: 500,
        },
      ]);

      expect(!result.ok && result.error.kind).toBe('notFound');
      expect(unwrap(await expenseRepository.findById(TRIP_OWNER, 'a'))).toEqual(euroExpense({ id: 'a' }));
    });

    it('rolls every update back when a write fails part-way', async () => {
      const { expenseRepository, handle } = await seededBudgetDatabase(
        [BUDGET_TRIP],
        [euroExpense({ id: 'a' }), euroExpense({ id: 'b' })],
      );
      const connection = handle.connections[0];
      if (!connection) throw new Error('database not opened');
      const run = connection.run.bind(connection);
      jest.spyOn(connection, 'run').mockImplementation(async (sql: string, params: SqlParams = []) => {
        if (/^\s*UPDATE\s+expenses/i.test(sql) && params.includes('b')) throw new Error('disk full');
        return run(sql, params);
      });
      const update = (id: string) => ({
        id,
        baseCurrency: 'GBP',
        baseAmount: 1700,
        exchangeRate: { rate: '0.85', rateDate: '2027-06-12', source: 'api' as const },
        updatedAt: 500,
      });

      const result = await expenseRepository.updateConversions(TRIP_OWNER, [update('a'), update('b')]);

      expect(!result.ok && result.error.kind).toBe('storage');
      jest.mocked(connection.run).mockRestore();
      expect(unwrap(await expenseRepository.findById(TRIP_OWNER, 'a'))?.baseCurrency).toBe('USD');
    });
  });

  describe('parent trips', () => {
    it("deletes a trip's expenses with the trip", async () => {
      const { expenseRepository, tripRepository, database } = await seededBudgetDatabase(
        [BUDGET_TRIP],
        [expense({ id: 'a' }), euroExpense({ id: 'b' })],
      );

      expect((await tripRepository.delete(TRIP_OWNER, 'trip-1')).ok).toBe(true);

      expect(unwrap(await expenseRepository.listByTrip(TRIP_OWNER, 'trip-1'))).toEqual([]);
      await expect(database.getFirst('SELECT COUNT(*) AS count FROM expenses')).resolves.toEqual({ count: 0 });
    });

    it('refuses an expense for a trip that does not exist', async () => {
      const { expenseRepository } = await seededBudgetDatabase([]);
      const result = await expenseRepository.insert(TRIP_OWNER, expense({ tripId: 'gone' }));
      expect(!result.ok && result.error.kind).toBe('storage');
    });
  });

  describe('schema', () => {
    it.each<[string, Partial<Expense>]>([
      ['a zero amount', { amount: 0 }],
      ['a negative amount', { amount: -500 }],
      ['a negative base amount', { baseAmount: -1 }],
      ['an empty title', { title: '' }],
      ['an unknown category', { category: 'nightlife' as Expense['category'] }],
      ['an unknown payment method', { paymentMethod: 'crypto' as Expense['paymentMethod'] }],
      ['a bad currency', { currency: 'DOLLAR' }],
      ['a base amount without a rate', { baseAmount: 4550, exchangeRate: null }],
      ['a rate without a base amount', { baseAmount: null }],
      ['an unknown rate source', { exchangeRate: { rate: '1', rateDate: '2027-06-12', source: 'guess' as 'api' } }],
    ])('rejects %s even if validation were bypassed', async (_name, overrides) => {
      const { expenseRepository } = await seededBudgetDatabase();
      const result = await expenseRepository.insert(TRIP_OWNER, expense(overrides));
      expect(!result.ok && result.error.kind).toBe('storage');
    });

    it('rejects a duplicate id', async () => {
      const { expenseRepository } = await seededBudgetDatabase([BUDGET_TRIP], [expense()]);
      expect((await expenseRepository.insert(TRIP_OWNER, expense())).ok).toBe(false);
    });

    it('rejects an expense without an owner', async () => {
      const { expenseRepository } = await seededBudgetDatabase();
      const result = await expenseRepository.insert('', expense());
      expect(!result.ok && result.error.kind).toBe('storage');
    });

    it('is migration 4, after favorites', () => {
      expect(APP_MIGRATIONS.map(({ version }) => version)).toEqual([1, 2, 3, 4]);
      expect(APP_MIGRATIONS[3]?.name).toMatch(/expenses/);
    });

    it('creates the expense indexes and the shared exchange-rate table', async () => {
      const { database } = createBudgetStorage();
      const names = await database.getAll<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE name IN ('idx_expenses_owner_trip_date', 'idx_expenses_trip', 'exchange_rates') ORDER BY name",
      );
      expect(names.map(({ name }) => name)).toEqual([
        'exchange_rates',
        'idx_expenses_owner_trip_date',
        'idx_expenses_trip',
      ]);
    });

    it('upgrades a version 3 database and keeps its trips, activities and favorites', async () => {
      const engine = createNodeSqliteEngine();
      const logger = createTestLogger();
      const open = (migrations = APP_MIGRATIONS) =>
        new SqliteDatabase({ driver: nodeSqliteDriver(() => engine).driver, migrations, logger });

      const v3 = open(APP_MIGRATIONS.filter(({ version }) => version <= 3));
      await new LocalTripRepository(v3, logger).insert(TRIP_OWNER, BUDGET_TRIP);
      await new LocalActivityRepository(v3, logger).insert(TRIP_OWNER, activity({ date: '2027-06-11' }));
      await v3.run(
        `INSERT INTO favorites (id, owner_id, target_id, category, name, saved_at)
         VALUES ('fav-1', ?, 'country-pt', 'country', 'Portugal', 1)`,
        [TRIP_OWNER],
      );
      await expect(v3.getFirst('PRAGMA user_version')).resolves.toEqual({ user_version: 3 });
      await v3.close();

      const upgraded = open();
      const repository = new LocalExpenseRepository(upgraded, logger);
      expect((await repository.insert(TRIP_OWNER, expense())).ok).toBe(true);

      await expect(upgraded.getFirst('PRAGMA user_version')).resolves.toEqual({ user_version: 4 });
      expect(unwrap(await new LocalTripRepository(upgraded, logger).list(TRIP_OWNER))).toEqual([BUDGET_TRIP]);
      expect(unwrap(await new LocalActivityRepository(upgraded, logger).listByTrip(TRIP_OWNER, 'trip-1'))).toHaveLength(
        1,
      );
      await expect(upgraded.getFirst('SELECT COUNT(*) AS count FROM favorites')).resolves.toEqual({ count: 1 });
      expect(unwrap(await repository.listByTrip(TRIP_OWNER, 'trip-1'))).toEqual([expense()]);
    });
  });

  describe('separation between accounts', () => {
    async function twoAccounts() {
      const storage = await seededBudgetDatabase([BUDGET_TRIP], [expense({ id: 'mine', title: 'Mine' })]);
      await storage.tripRepository.insert(OTHER_TRIP_OWNER, storedTrip({ id: 'their-trip' }));
      await storage.expenseRepository.insert(
        OTHER_TRIP_OWNER,
        expense({ id: 'theirs', tripId: 'their-trip', title: 'Theirs' }),
      );
      return storage;
    }

    it("lists and finds only the owner's expenses", async () => {
      const { expenseRepository } = await twoAccounts();
      expect(unwrap(await expenseRepository.listByTrip(TRIP_OWNER, 'their-trip'))).toEqual([]);
      expect(unwrap(await expenseRepository.findById(TRIP_OWNER, 'theirs'))).toBeNull();
      expect(unwrap(await expenseRepository.findById(OTHER_TRIP_OWNER, 'theirs'))?.title).toBe('Theirs');
    });

    it("treats another account's expense as missing and leaves it unchanged", async () => {
      const { expenseRepository } = await twoAccounts();
      const theirs = expense({ id: 'theirs', tripId: 'their-trip', title: 'Theirs' });

      const updated = await expenseRepository.update(TRIP_OWNER, { ...theirs, title: 'Taken' });
      const converted = await expenseRepository.updateConversions(TRIP_OWNER, [
        { id: 'theirs', baseCurrency: 'EUR', baseAmount: null, exchangeRate: null, updatedAt: 1 },
      ]);
      const deleted = await expenseRepository.delete(TRIP_OWNER, 'theirs');

      expect(!updated.ok && updated.error.kind).toBe('notFound');
      expect(!converted.ok && converted.error.kind).toBe('notFound');
      expect(!deleted.ok && deleted.error.kind).toBe('notFound');
      expect(unwrap(await expenseRepository.findById(OTHER_TRIP_OWNER, 'theirs'))).toEqual(theirs);
    });
  });

  it('keeps expenses across an app restart', async () => {
    const engine = createNodeSqliteEngine();
    const logger = createTestLogger();
    const open = () =>
      new SqliteDatabase({ driver: nodeSqliteDriver(() => engine).driver, migrations: APP_MIGRATIONS, logger });

    const first = open();
    await new LocalTripRepository(first, logger).insert(TRIP_OWNER, BUDGET_TRIP);
    await new LocalExpenseRepository(first, logger).insert(TRIP_OWNER, euroExpense());
    await first.close();

    expect(unwrap(await new LocalExpenseRepository(open(), logger).listByTrip(TRIP_OWNER, 'trip-1'))).toEqual([
      euroExpense(),
    ]);
  });

  it('skips a corrupt row, logs it, and still returns the rest', async () => {
    const { expenseRepository, database, logger } = await seededBudgetDatabase(
      [BUDGET_TRIP],
      [expense({ id: 'good' }), expense({ id: 'bad', title: 'Bad' })],
    );
    await database.run("UPDATE expenses SET date = 'garbage' WHERE id = 'bad'");

    await expect(ids(expenseRepository)).resolves.toEqual(['good']);
    expect(unwrap(await expenseRepository.findById(TRIP_OWNER, 'bad'))).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith('Skipped unreadable expenses', { skipped: 1 });
  });

  it('turns database failures into storage errors instead of throwing', async () => {
    const { expenseRepository, handle } = createBudgetStorage();
    handle.failOpens = 1;
    const result = await expenseRepository.listByTrip(TRIP_OWNER, 'trip-1');
    expect(!result.ok && result.error.kind).toBe('storage');
    expect((await expenseRepository.listByTrip(TRIP_OWNER, 'trip-1')).ok).toBe(true);
  });
});
