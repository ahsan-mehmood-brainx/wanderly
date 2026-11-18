import { z } from 'zod';

import { AppError } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { err, ok, type Result } from '@/core/result';
import { type KeyValueStore } from '@/core/storage/KeyValueStore';

import { type RecentDestination } from '../domain/Destination';
import { parseDestinationId } from '../domain/DestinationId';
import { type DiscoveryHistoryRepository } from '../domain/repositories';
import { MAX_RECENTLY_VIEWED, MAX_SEARCH_HISTORY } from '../domain/usecases/discoveryHistory';

export const SEARCH_HISTORY_KEY = 'discover.searchHistory.v1';
export const RECENTLY_VIEWED_KEY = 'discover.recentlyViewed.v1';

const nullableString = z.string().nullable().catch(null);

const recentDestinationSchema = z.object({
  id: z.string().refine((id) => parseDestinationId(id) !== null),
  kind: z.enum(['country', 'city', 'place']),
  name: z.string().min(1),
  countryCode: nullableString,
  countryName: nullableString,
  imageUrl: nullableString,
  flagEmoji: nullableString,
  viewedAt: z.number().catch(0),
});

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Parses an array item by item, so one bad entry is dropped instead of the whole list. */
function parseList<T>(raw: unknown, item: z.ZodType<T>, max: number): T[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((entry) => {
      const parsed = item.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    })
    .slice(0, max);
}

/** Search history and recently viewed destinations in plain device storage (neither is sensitive). */
export class StorageDiscoveryHistoryRepository implements DiscoveryHistoryRepository {
  constructor(
    private readonly store: KeyValueStore,
    private readonly logger: Logger,
  ) {}

  async loadSearchHistory(): Promise<readonly string[]> {
    const raw = await this.read(SEARCH_HISTORY_KEY);
    return parseList(raw, z.string().trim().min(1), MAX_SEARCH_HISTORY);
  }

  saveSearchHistory(queries: readonly string[]): Promise<Result<void, AppError>> {
    return this.write(SEARCH_HISTORY_KEY, queries);
  }

  async loadRecentlyViewed(): Promise<readonly RecentDestination[]> {
    const raw = await this.read(RECENTLY_VIEWED_KEY);
    return parseList(raw, recentDestinationSchema, MAX_RECENTLY_VIEWED);
  }

  saveRecentlyViewed(destinations: readonly RecentDestination[]): Promise<Result<void, AppError>> {
    return this.write(RECENTLY_VIEWED_KEY, destinations);
  }

  private async read(key: string): Promise<unknown> {
    try {
      const raw = await this.store.getItem(key);
      return raw === null ? undefined : parseJson(raw);
    } catch (cause) {
      this.logger.warn('Could not read discovery history; starting empty', { key, cause });
      return undefined;
    }
  }

  private async write(key: string, value: unknown): Promise<Result<void, AppError>> {
    try {
      await this.store.setItem(key, JSON.stringify(value));
      return ok(undefined);
    } catch (cause) {
      return err(new AppError('storage', `Failed to save ${key}`, { cause }));
    }
  }
}
