import { z } from 'zod';

import { AppError } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { err, ok, type Result } from '@/core/result';
import { type KeyValueStore } from '@/core/storage/KeyValueStore';

import { EMPTY_LOCAL_PROFILE, PROFILE_LIMITS, type LocalProfile } from '../domain/LocalProfile';
import { type LocalProfileRepository } from '../domain/repositories';

export const LOCAL_PROFILE_STORAGE_PREFIX = 'profile.local.v1.';

export function localProfileStorageKey(ownerId: string): string {
  return `${LOCAL_PROFILE_STORAGE_PREFIX}${ownerId}`;
}

const text = (maxLength: number) => z.string().trim().min(1).max(maxLength).nullable().catch(null);

/** Each field falls back on its own, so one corrupt value never discards the rest of the profile. */
const storedProfileSchema = z.object({
  displayName: text(PROFILE_LIMITS.displayNameMaxLength),
  homeBase: text(PROFILE_LIMITS.homeBaseMaxLength),
  bio: text(PROFILE_LIMITS.bioMaxLength),
  photo: z.string().min(1).nullable().catch(null),
  updatedAt: z.number().int().nonnegative().nullable().catch(null),
});

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** One small JSON document per account in the key-value store. */
export class StorageLocalProfileRepository implements LocalProfileRepository {
  constructor(
    private readonly store: KeyValueStore,
    private readonly logger: Logger,
  ) {}

  async load(ownerId: string): Promise<Result<LocalProfile, AppError>> {
    let raw: string | null;
    try {
      raw = await this.store.getItem(localProfileStorageKey(ownerId));
    } catch (cause) {
      return err(new AppError('storage', 'Failed to read the local profile', { cause }));
    }
    if (raw === null) return ok(EMPTY_LOCAL_PROFILE);

    const parsed = storedProfileSchema.safeParse(parseJson(raw));
    if (!parsed.success) {
      this.logger.warn('Stored local profile was unreadable; using an empty profile');
      return ok(EMPTY_LOCAL_PROFILE);
    }
    return ok(parsed.data);
  }

  async save(ownerId: string, profile: LocalProfile): Promise<Result<void, AppError>> {
    try {
      await this.store.setItem(localProfileStorageKey(ownerId), JSON.stringify(profile));
      return ok(undefined);
    } catch (cause) {
      return err(new AppError('storage', 'Failed to save the local profile', { cause }));
    }
  }
}
