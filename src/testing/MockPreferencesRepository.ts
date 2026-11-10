import { type AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';
import { DEFAULT_PREFERENCES, type Preferences } from '@/features/preferences/domain/Preferences';
import { type PreferencesRepository } from '@/features/preferences/domain/PreferencesRepository';

/**
 * Stateful in-memory PreferencesRepository. Unlike a bare `jest.fn()` stub it
 * behaves like the real thing (what you save is what you load), and failures can
 * be switched on per operation. Methods are jest spies for call assertions.
 */
export class MockPreferencesRepository implements PreferencesRepository {
  stored: Preferences;
  loadError: AppError | null = null;
  saveError: AppError | null = null;

  constructor(initial: Preferences = DEFAULT_PREFERENCES) {
    this.stored = initial;
  }

  readonly load = jest.fn(async (): Promise<Result<Preferences, AppError>> => {
    return this.loadError ? err(this.loadError) : ok(this.stored);
  });

  readonly save = jest.fn(async (preferences: Preferences): Promise<Result<void, AppError>> => {
    if (this.saveError) return err(this.saveError);
    this.stored = preferences;
    return ok(undefined);
  });
}
