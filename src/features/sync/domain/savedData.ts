import { type CacheStore } from '@/core/cache/CacheStore';
import { AppError } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { err, ok, type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';

/** Copies of remote data kept on the device for offline use. */
export interface SavedDataSummary {
  readonly entries: number;
  readonly bytes: number;
  /** When the most recent copy was downloaded; `null` when nothing is saved. */
  readonly newestStoredAt: number | null;
}

export class GetSavedDataSummary implements UseCase<void, Result<SavedDataSummary, AppError>> {
  constructor(
    private readonly store: Pick<CacheStore, 'stats'>,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<Result<SavedDataSummary, AppError>> {
    try {
      const stats = await this.store.stats();
      const newest = stats.flatMap((item) => (item.newestStoredAt === null ? [] : [item.newestStoredAt]));
      return ok({
        entries: stats.reduce((sum, item) => sum + item.entries, 0),
        bytes: stats.reduce((sum, item) => sum + item.bytes, 0),
        newestStoredAt: newest.length > 0 ? Math.max(...newest) : null,
      });
    } catch (cause) {
      this.logger.error('Could not read saved data', { cause });
      return err(new AppError('storage', 'Could not read saved data', { cause }));
    }
  }
}

/** Deletes every saved copy of remote data. The traveller's own data is in other tables and is not touched. */
export class ClearSavedData implements UseCase<void, Result<void, AppError>> {
  constructor(
    private readonly store: Pick<CacheStore, 'clear'>,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<Result<void, AppError>> {
    try {
      await this.store.clear();
      return ok(undefined);
    } catch (cause) {
      this.logger.error('Could not clear saved data', { cause });
      return err(new AppError('storage', 'Could not clear saved data', { cause }));
    }
  }
}
