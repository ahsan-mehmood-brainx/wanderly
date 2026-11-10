import { AppError } from '@/core/errors/AppError';
import { MockPreferencesRepository } from '@/testing/MockPreferencesRepository';
import { createTestLogger } from '@/testing/testDependencies';

import { DEFAULT_PREFERENCES } from '../Preferences';
import { LoadPreferences, PREFERENCES_LOAD_TIMEOUT_MS } from './LoadPreferences';

function setup(repository = new MockPreferencesRepository()) {
  const logger = createTestLogger();
  return { useCase: new LoadPreferences(repository, logger), repository, logger };
}

describe('LoadPreferences', () => {
  it('returns stored preferences', async () => {
    const { useCase } = setup(new MockPreferencesRepository({ theme: 'dark', language: 'es' }));
    await expect(useCase.execute()).resolves.toEqual({ theme: 'dark', language: 'es' });
  });

  it('falls back to defaults and logs when the repository reports an error', async () => {
    const repository = new MockPreferencesRepository({ theme: 'dark', language: 'es' });
    repository.loadError = new AppError('storage', 'unreadable');
    const { useCase, logger } = setup(repository);

    await expect(useCase.execute()).resolves.toEqual(DEFAULT_PREFERENCES);
    expect(logger.error).toHaveBeenCalledWith('Could not load preferences', repository.loadError);
  });

  it('falls back to defaults and logs when the repository breaks its contract by throwing', async () => {
    const repository = new MockPreferencesRepository();
    repository.load.mockRejectedValueOnce(new Error('contract violation'));
    const { useCase, logger } = setup(repository);

    await expect(useCase.execute()).resolves.toEqual(DEFAULT_PREFERENCES);
    expect(logger.error).toHaveBeenCalledWith('Preferences repository threw while loading', expect.any(Error));
  });

  it('falls back to defaults if storage never answers', async () => {
    jest.useFakeTimers();
    try {
      const repository = new MockPreferencesRepository();
      repository.load.mockReturnValueOnce(new Promise(() => undefined));
      const { useCase, logger } = setup(repository);

      const pending = useCase.execute();
      await jest.advanceTimersByTimeAsync(PREFERENCES_LOAD_TIMEOUT_MS);

      await expect(pending).resolves.toEqual(DEFAULT_PREFERENCES);
      expect(logger.warn).toHaveBeenCalledWith('Loading preferences timed out; using defaults', {
        timeoutMs: PREFERENCES_LOAD_TIMEOUT_MS,
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
