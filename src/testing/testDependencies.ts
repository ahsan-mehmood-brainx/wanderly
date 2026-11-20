import { APP_MIGRATIONS } from '@/bootstrap/databaseMigrations';
import { createAppConfig } from '@/core/config/appConfig';
import { SqliteDatabase } from '@/core/database/SqliteDatabase';
import { type AppDependencies } from '@/core/di/AppDependencies';
import { type CoreDependencies } from '@/core/di/CoreDependencies';
import { createContainer, type Factories, valueFactories } from '@/core/di/createContainer';
import { type LogContext, type Logger } from '@/core/logging/Logger';
import { authFactories } from '@/features/auth/di';
import { budgetFactories } from '@/features/budget/di';
import { discoverFactories } from '@/features/discover/di';
import { favoritesFactories } from '@/features/favorites/di';
import { itineraryFactories } from '@/features/itinerary/di';
import { mapFactories } from '@/features/map/di';
import { onboardingFactories } from '@/features/onboarding/di';
import { preferencesFactories } from '@/features/preferences/di';
import { tripsFactories } from '@/features/trips/di';
import { weatherFactories } from '@/features/weather/di';

import { FakeConnectivityService } from './FakeConnectivityService';
import { FakeDeviceLocationService } from './FakeDeviceLocationService';
import { FakeHttpClientFactory } from './FakeHttpClient';
import { FakeLocationService } from './FakeLocationService';
import { InMemoryKeyValueStore } from './InMemoryKeyValueStore';
import { ManualClock, sequentialIds } from './ManualClock';
import { nodeSqliteDriver } from './nodeSqliteDriver';
import { FakeImagePickerService, FakeTripCoverStore, FakeTripOwnerProvider } from './tripFixtures';

export const TEST_RESTCOUNTRIES_API_KEY = 'test-restcountries-key';

/** Logger whose methods are jest spies. `child()` returns the same logger, so assertions see scoped logs too. */
export function createTestLogger(): jest.Mocked<Logger> {
  const logger: jest.Mocked<Logger> = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn((_context: LogContext): Logger => logger),
  };
  return logger;
}

/** In-memory fakes for every core port: no storage, network or native modules. */
export function testCoreFactories(): Factories<CoreDependencies> {
  return {
    config: () => createAppConfig(false),
    logger: () => createTestLogger(),
    clock: () => new ManualClock(),
    idGenerator: () => sequentialIds(),
    keyValueStore: () => new InMemoryKeyValueStore(),
    secureStore: () => new InMemoryKeyValueStore(),
    // Real SQLite in memory, one database per container.
    database: (c) =>
      new SqliteDatabase({ driver: nodeSqliteDriver().driver, migrations: APP_MIGRATIONS, logger: c.logger }),
    connectivity: () => new FakeConnectivityService(),
    httpClientFactory: () => new FakeHttpClientFactory(),
  };
}

/**
 * A real container with every infrastructure port replaced by an in-memory fake
 * and real feature code on top. Pass overrides to inject mocks; they flow into
 * everything that depends on them.
 */
export function createTestDependencies(overrides: Partial<AppDependencies> = {}): AppDependencies {
  return createContainer<AppDependencies>({
    ...testCoreFactories(),
    ...preferencesFactories,
    ...onboardingFactories,
    ...authFactories,
    ...discoverFactories,
    ...weatherFactories,
    ...mapFactories,
    ...tripsFactories,
    ...itineraryFactories,
    ...favoritesFactories,
    ...budgetFactories,
    // Tests never read the build environment; a key is present unless a test overrides it with `null`.
    restCountriesApiKey: () => TEST_RESTCOUNTRIES_API_KEY,
    // No native location module in tests; permission starts undetermined.
    deviceLocationService: () => new FakeDeviceLocationService(),
    mapLocationService: () => new FakeLocationService(),
    // Trip tests run as a signed-in account without going through sign-in.
    tripOwnerProvider: () => new FakeTripOwnerProvider(),
    // No native file system or photo picker in tests.
    tripCoverStore: () => new FakeTripCoverStore(),
    imagePickerService: () => new FakeImagePickerService(),
    ...valueFactories(overrides),
  });
}
