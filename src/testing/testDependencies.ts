import { createAppConfig } from '@/core/config/appConfig';
import { type AppDependencies } from '@/core/di/AppDependencies';
import { type CoreDependencies } from '@/core/di/CoreDependencies';
import { createContainer, type Factories, valueFactories } from '@/core/di/createContainer';
import { type LogContext, type Logger } from '@/core/logging/Logger';
import { preferencesFactories } from '@/features/preferences/di';

import { FakeConnectivityService } from './FakeConnectivityService';
import { FakeHttpClientFactory } from './FakeHttpClient';
import { InMemoryKeyValueStore } from './InMemoryKeyValueStore';
import { ManualClock, sequentialIds } from './ManualClock';

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
    ...valueFactories(overrides),
  });
}
