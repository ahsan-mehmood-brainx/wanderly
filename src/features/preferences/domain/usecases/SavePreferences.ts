import { AppError } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { err, type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';

import { type Preferences } from '../Preferences';
import { type PreferencesRepository } from '../PreferencesRepository';

/**
 * Persists a preference change by merging it into what storage currently holds,
 * never into in-memory state. If the start-up load failed, the app runs on
 * defaults, and saving that full set would silently overwrite the settings the
 * user did not touch. If storage still cannot be read, nothing is written.
 *
 * Saves run one at a time, so two quick changes cannot both read the same
 * snapshot and drop each other's field. Never throws; failures are logged and returned.
 */
export class SavePreferences implements UseCase<Partial<Preferences>, Result<void, AppError>> {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly repository: PreferencesRepository,
    private readonly logger: Logger,
  ) {}

  execute(changes: Partial<Preferences>): Promise<Result<void, AppError>> {
    const run = this.queue.then(() => this.mergeAndSave(changes));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async mergeAndSave(changes: Partial<Preferences>): Promise<Result<void, AppError>> {
    try {
      const current = await this.repository.load();
      if (!current.ok) {
        this.logger.error('Could not read preferences before saving; nothing was written', current.error);
        return err(current.error);
      }
      const result = await this.repository.save({ ...current.value, ...changes });
      if (!result.ok) this.logger.error('Could not save preferences', result.error);
      return result;
    } catch (error) {
      // Repositories should return err(...); a throwing one is a contract violation worth surfacing.
      this.logger.error('Preferences repository threw while saving', error);
      return err(new AppError('storage', 'Preferences repository threw while saving', { cause: error }));
    }
  }
}
