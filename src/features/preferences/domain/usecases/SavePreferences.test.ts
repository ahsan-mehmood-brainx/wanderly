import { AppError } from '@/core/errors/AppError';
import { MockPreferencesRepository } from '@/testing/MockPreferencesRepository';
import { createTestLogger } from '@/testing/testDependencies';

import { SavePreferences } from './SavePreferences';

const stored = { theme: 'dark', language: 'es' } as const;

function setup(repository = new MockPreferencesRepository(stored)) {
  const logger = createTestLogger();
  return { useCase: new SavePreferences(repository, logger), repository, logger };
}

describe('SavePreferences', () => {
  it('merges the change into what storage holds', async () => {
    const { useCase, repository } = setup();

    await expect(useCase.execute({ theme: 'light' })).resolves.toEqual({ ok: true, value: undefined });
    expect(repository.stored).toEqual({ theme: 'light', language: 'es' });
  });

  it('writes nothing and returns the error when storage cannot be read', async () => {
    const repository = new MockPreferencesRepository(stored);
    repository.loadError = new AppError('storage', 'unreadable');
    const { useCase, logger } = setup(repository);

    await expect(useCase.execute({ theme: 'light' })).resolves.toEqual({ ok: false, error: repository.loadError });
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.stored).toEqual(stored);
    expect(logger.error).toHaveBeenCalledWith(
      'Could not read preferences before saving; nothing was written',
      repository.loadError,
    );
  });

  it('keeps both of two concurrent changes', async () => {
    const { useCase, repository } = setup();

    await Promise.all([useCase.execute({ theme: 'light' }), useCase.execute({ language: 'en' })]);

    expect(repository.stored).toEqual({ theme: 'light', language: 'en' });
  });

  it('keeps saving after an earlier save fails', async () => {
    const repository = new MockPreferencesRepository(stored);
    repository.save.mockRejectedValueOnce(new Error('contract violation'));
    const { useCase } = setup(repository);

    const first = useCase.execute({ theme: 'light' });
    const second = useCase.execute({ language: 'en' });

    expect((await first).ok).toBe(false);
    expect((await second).ok).toBe(true);
    expect(repository.stored).toEqual({ theme: 'dark', language: 'en' });
  });

  it('returns and logs a repository error', async () => {
    const repository = new MockPreferencesRepository(stored);
    repository.saveError = new AppError('storage', 'disk full');
    const { useCase, logger } = setup(repository);

    await expect(useCase.execute({ theme: 'light' })).resolves.toEqual({ ok: false, error: repository.saveError });
    expect(logger.error).toHaveBeenCalledWith('Could not save preferences', repository.saveError);
  });

  it('converts a throwing repository into a storage error instead of throwing', async () => {
    const repository = new MockPreferencesRepository(stored);
    repository.save.mockRejectedValueOnce(new Error('contract violation'));
    const { useCase, logger } = setup(repository);

    const result = await useCase.execute({ theme: 'light' });

    expect(!result.ok && result.error.kind).toBe('storage');
    expect(logger.error).toHaveBeenCalledWith('Preferences repository threw while saving', expect.any(Error));
  });
});
