import { type Logger } from '@/core/logging/Logger';
import { type UseCase } from '@/core/usecase/UseCase';

import { type RecentDestination } from '../Destination';
import { type DiscoveryHistoryRepository } from '../repositories';
import { normalizeQuery, normalizeText } from '../searchMatching';

export const MAX_SEARCH_HISTORY = 10;
export const MAX_RECENTLY_VIEWED = 12;
/** Shorter queries ("a", "lo") are keystrokes, not searches worth remembering. */
export const MIN_REMEMBERED_QUERY_LENGTH = 2;

export interface DiscoveryHistorySnapshot {
  readonly searchHistory: readonly string[];
  readonly recentlyViewed: readonly RecentDestination[];
}

const EMPTY: DiscoveryHistorySnapshot = { searchHistory: [], recentlyViewed: [] };

/**
 * Owns the search history and recently viewed list for this run.
 *
 * Lists are loaded once and kept in memory; every change is applied in memory
 * first and written through a queue, so rapid changes (typing several searches,
 * opening destinations quickly) are saved in order and never overwrite each other.
 * History is a convenience: a failed write is logged, and the list still works for
 * this session.
 */
export class DiscoveryHistory {
  private snapshot: DiscoveryHistorySnapshot | null = null;
  private loading: Promise<DiscoveryHistorySnapshot> | null = null;
  private writes: Promise<void> = Promise.resolve();

  constructor(
    private readonly repository: DiscoveryHistoryRepository,
    private readonly logger: Logger,
  ) {}

  load(): Promise<DiscoveryHistorySnapshot> {
    if (this.snapshot) return Promise.resolve(this.snapshot);
    this.loading ??= Promise.all([this.repository.loadSearchHistory(), this.repository.loadRecentlyViewed()]).then(
      ([searchHistory, recentlyViewed]) => {
        // A change made while loading wins over what was on disk.
        this.snapshot ??= { searchHistory, recentlyViewed };
        return this.snapshot;
      },
    );
    return this.loading;
  }

  async addQuery(query: string): Promise<readonly string[]> {
    const text = normalizeQuery(query);
    await this.load();
    const { searchHistory } = this.live();
    if (normalizeText(text).length < MIN_REMEMBERED_QUERY_LENGTH) return searchHistory;
    const key = normalizeText(text);
    const next = [text, ...searchHistory.filter((entry) => normalizeText(entry) !== key)].slice(0, MAX_SEARCH_HISTORY);
    return this.updateSearchHistory(next);
  }

  async removeQuery(query: string): Promise<readonly string[]> {
    await this.load();
    const { searchHistory } = this.live();
    return this.updateSearchHistory(searchHistory.filter((entry) => entry !== query));
  }

  async clearQueries(): Promise<readonly string[]> {
    await this.load();
    return this.updateSearchHistory([]);
  }

  async recordView(destination: RecentDestination): Promise<readonly RecentDestination[]> {
    await this.load();
    const { recentlyViewed } = this.live();
    const next = [destination, ...recentlyViewed.filter((entry) => entry.id !== destination.id)].slice(
      0,
      MAX_RECENTLY_VIEWED,
    );
    return this.updateRecentlyViewed(next);
  }

  async clearViews(): Promise<readonly RecentDestination[]> {
    await this.load();
    return this.updateRecentlyViewed([]);
  }

  /**
   * The live snapshot. Mutators call it synchronously right after `await this.load()`
   * and write before awaiting again, so read-modify-write never interleaves: two
   * changes started in the same tick would otherwise both start from the same old
   * list, and the second would drop the first.
   */
  private live(): DiscoveryHistorySnapshot {
    return this.snapshot ?? EMPTY;
  }

  private updateSearchHistory(searchHistory: readonly string[]): readonly string[] {
    this.snapshot = { recentlyViewed: this.snapshot?.recentlyViewed ?? [], searchHistory };
    this.enqueue('search history', () => this.repository.saveSearchHistory(searchHistory));
    return searchHistory;
  }

  private updateRecentlyViewed(recentlyViewed: readonly RecentDestination[]): readonly RecentDestination[] {
    this.snapshot = { searchHistory: this.snapshot?.searchHistory ?? [], recentlyViewed };
    this.enqueue('recently viewed', () => this.repository.saveRecentlyViewed(recentlyViewed));
    return recentlyViewed;
  }

  private enqueue(what: string, write: () => ReturnType<DiscoveryHistoryRepository['saveSearchHistory']>): void {
    this.writes = this.writes.then(async () => {
      const result = await write();
      if (!result.ok) this.logger.warn(`Could not save ${what}`, { kind: result.error.kind });
    });
  }

  /** Resolves once every queued write has finished (for tests and shutdown). */
  flush(): Promise<void> {
    return this.writes;
  }
}

// Thin use cases so presentation depends on `UseCase` like everywhere else.

export class LoadDiscoveryHistory implements UseCase<void, DiscoveryHistorySnapshot> {
  constructor(private readonly history: DiscoveryHistory) {}
  execute(): Promise<DiscoveryHistorySnapshot> {
    return this.history.load();
  }
}

export class RememberSearch implements UseCase<string, readonly string[]> {
  constructor(private readonly history: DiscoveryHistory) {}
  execute(query: string): Promise<readonly string[]> {
    return this.history.addQuery(query);
  }
}

export class ForgetSearch implements UseCase<string, readonly string[]> {
  constructor(private readonly history: DiscoveryHistory) {}
  execute(query: string): Promise<readonly string[]> {
    return this.history.removeQuery(query);
  }
}

export class ClearSearchHistory implements UseCase<void, readonly string[]> {
  constructor(private readonly history: DiscoveryHistory) {}
  execute(): Promise<readonly string[]> {
    return this.history.clearQueries();
  }
}

export class RecordDestinationView implements UseCase<RecentDestination, readonly RecentDestination[]> {
  constructor(private readonly history: DiscoveryHistory) {}
  execute(destination: RecentDestination): Promise<readonly RecentDestination[]> {
    return this.history.recordView(destination);
  }
}

export class ClearRecentlyViewed implements UseCase<void, readonly RecentDestination[]> {
  constructor(private readonly history: DiscoveryHistory) {}
  execute(): Promise<readonly RecentDestination[]> {
    return this.history.clearViews();
  }
}
