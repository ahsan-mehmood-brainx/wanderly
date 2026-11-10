import { type AppDependencies } from '@/core/di/AppDependencies';
import { type Logger } from '@/core/logging/Logger';
import { StoragePreferencesRepository } from '@/features/preferences/data/StoragePreferencesRepository';

import { InMemoryKeyValueStore } from './InMemoryKeyValueStore';

export function createTestLogger(): jest.Mocked<Logger> {
  return { warn: jest.fn(), error: jest.fn() };
}

/** Real implementations over in-memory storage; pass overrides to inject fakes. */
export function createTestDependencies(overrides: Partial<AppDependencies> = {}): AppDependencies {
  const logger = overrides.logger ?? createTestLogger();
  return {
    logger,
    preferencesRepository: new StoragePreferencesRepository(new InMemoryKeyValueStore(), logger),
    ...overrides,
  };
}
