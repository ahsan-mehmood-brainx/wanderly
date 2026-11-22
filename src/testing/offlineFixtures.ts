import { type DatabaseSync } from 'node:sqlite';

import { APP_MIGRATIONS } from '@/bootstrap/databaseMigrations';
import { SqliteCacheStore } from '@/core/cache/SqliteCacheStore';
import { SqliteDatabase } from '@/core/database/SqliteDatabase';
import { type AppError } from '@/core/errors/AppError';
import { ok, type Result } from '@/core/result';
import { SqliteSyncOutbox } from '@/core/sync/SqliteSyncOutbox';
import { type SyncGateway, type SyncPush } from '@/core/sync/SyncGateway';

import { ManualClock, sequentialIds } from './ManualClock';
import { nodeSqliteDriver } from './nodeSqliteDriver';
import { createTestLogger } from './testDependencies';

/** Midday UTC on 2027-06-15: the same date in nearly every time zone. */
export const OFFLINE_NOW = Date.UTC(2027, 5, 15, 12);

/**
 * The app database (real SQLite in memory, every migration) with the outbox and
 * cache store on top. Pass `engine` to share data with a later call, which is how
 * tests simulate an app restart.
 */
export function createOfflineStorage(options: { engine?: DatabaseSync; clock?: ManualClock } = {}) {
  const { engine } = options;
  const handle = nodeSqliteDriver(engine ? () => engine : undefined);
  const logger = createTestLogger();
  const clock = options.clock ?? new ManualClock(OFFLINE_NOW);
  const database = new SqliteDatabase({ driver: handle.driver, migrations: APP_MIGRATIONS, logger });
  const outbox = new SqliteSyncOutbox(database, clock, sequentialIds('op'), logger);
  const cacheStore = new SqliteCacheStore(database);
  return { handle, logger, clock, database, outbox, cacheStore };
}

/**
 * A remote {@link SyncGateway} you script from the test: queue results with
 * `respond`, and read what arrived in `pushes`. Unscripted pushes succeed.
 */
export class FakeSyncGateway implements SyncGateway {
  readonly mode = 'remote' as const;
  readonly pushes: SyncPush[] = [];
  private readonly responses: (Result<void, AppError> | (() => Promise<Result<void, AppError>>))[] = [];

  readonly push = jest.fn(async (push: SyncPush): Promise<Result<void, AppError>> => {
    this.pushes.push(push);
    const next = this.responses.shift();
    if (!next) return ok(undefined);
    return typeof next === 'function' ? next() : next;
  });

  respond(...results: (Result<void, AppError> | (() => Promise<Result<void, AppError>>))[]): void {
    this.responses.push(...results);
  }

  /** Idempotency keys in push order. */
  keys(): string[] {
    return this.pushes.map((push) => push.operation.idempotencyKey);
  }
}
