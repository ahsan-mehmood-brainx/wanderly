import { Platform } from 'react-native';

import { SqliteCacheStore } from '@/core/cache/SqliteCacheStore';
import { type AppConfig } from '@/core/config/appConfig';
import { expoSqliteDriver } from '@/core/database/ExpoSqliteDriver';
import { SqliteDatabase } from '@/core/database/SqliteDatabase';
import { type CoreDependencies } from '@/core/di/CoreDependencies';
import { type Factories } from '@/core/di/createContainer';
import { AxiosHttpClientFactory } from '@/core/http/HttpClientFactory';
import { ExponentialBackoffRetry } from '@/core/http/strategies/RetryStrategy';
import { AppLogger, ConsoleTransport } from '@/core/logging/Logger';
import { NetInfoConnectivityService } from '@/core/network/NetInfoConnectivityService';
import { AsyncStorageKeyValueStore } from '@/core/storage/AsyncStorageKeyValueStore';
import { ExpoSecureKeyValueStore } from '@/core/storage/ExpoSecureKeyValueStore';
import { MemorySecureKeyValueStore } from '@/core/storage/MemorySecureKeyValueStore';
import { SqliteSyncOutbox } from '@/core/sync/SqliteSyncOutbox';
import { systemClock } from '@/core/utils/Clock';
import { randomId } from '@/core/utils/IdGenerator';

import { APP_DATABASE_NAME, APP_MIGRATIONS } from './databaseMigrations';

interface CoreFactoryOptions {
  readonly config: AppConfig;
  /** Current UI language, read on every request. */
  readonly getLanguage: () => string;
}

/** Production choices for every core port. Platform-specific classes are named only here. */
export function createCoreFactories({ config, getLanguage }: CoreFactoryOptions): Factories<CoreDependencies> {
  return {
    config: () => config,
    clock: () => systemClock,
    idGenerator: () => randomId,
    // Console runs in every build: in release, React Native forwards console.warn/error to the native
    // device log (os_log / logcat), so warnings and errors are never silently dropped. A crash-reporting
    // transport (e.g. Sentry) is added to this list alongside it, not instead of it.
    logger: (c) =>
      new AppLogger({
        transports: [new ConsoleTransport()],
        minLevel: c.config.isDev ? 'debug' : 'warn',
        clock: c.clock,
      }),
    keyValueStore: () => new AsyncStorageKeyValueStore(),
    // SecureStore has no web implementation; web keeps secrets in memory rather than in plain localStorage.
    secureStore: () => (Platform.OS === 'web' ? new MemorySecureKeyValueStore() : new ExpoSecureKeyValueStore()),
    database: (c) =>
      new SqliteDatabase({
        driver: expoSqliteDriver(APP_DATABASE_NAME),
        migrations: APP_MIGRATIONS,
        logger: c.logger.child({ scope: 'database' }),
      }),
    cacheStore: (c) => new SqliteCacheStore(c.database),
    syncOutbox: (c) => new SqliteSyncOutbox(c.database, c.clock, c.idGenerator, c.logger.child({ scope: 'sync' })),
    // Both sides of the same table; the engine listens to `localChangeLog.recorded`.
    localChangeLog: (c) => new SqliteSyncOutbox(c.database, c.clock, c.idGenerator, c.logger.child({ scope: 'sync' })),
    connectivity: (c) => new NetInfoConnectivityService(c.logger.child({ scope: 'connectivity' })),
    httpClientFactory: (c) =>
      new AxiosHttpClientFactory({
        logger: c.logger,
        connectivity: c.connectivity,
        clock: c.clock,
        idGenerator: c.idGenerator,
        getLanguage,
        defaults: {
          timeoutMs: c.config.http.timeoutMs,
          retry: new ExponentialBackoffRetry({ maxRetries: c.config.http.maxRetries }),
        },
      }),
  };
}
