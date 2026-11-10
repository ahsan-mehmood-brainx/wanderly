import { z } from 'zod';

import { AppError } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { err, ok, type Result } from '@/core/result';
import { type KeyValueStore } from '@/core/storage/KeyValueStore';

import {
  DEFAULT_PREFERENCES,
  LANGUAGE_PREFERENCES,
  THEME_PREFERENCES,
  type Preferences,
} from '../domain/Preferences';
import { type PreferencesRepository } from '../domain/PreferencesRepository';

export const PREFERENCES_STORAGE_KEY = 'preferences.v1';

/**
 * Each field falls back independently, so one corrupted or outdated value
 * (e.g. a removed language) never discards the user's other choices.
 */
const storedPreferencesSchema = z.object({
  theme: z.enum(THEME_PREFERENCES).catch(DEFAULT_PREFERENCES.theme),
  language: z.enum(LANGUAGE_PREFERENCES).catch(DEFAULT_PREFERENCES.language),
});

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export class StoragePreferencesRepository implements PreferencesRepository {
  constructor(
    private readonly store: KeyValueStore,
    private readonly logger: Logger,
  ) {}

  async load(): Promise<Result<Preferences, AppError>> {
    let raw: string | null;
    try {
      raw = await this.store.getItem(PREFERENCES_STORAGE_KEY);
    } catch (cause) {
      return err(new AppError('storage', 'Failed to read preferences', { cause }));
    }

    if (raw === null) return ok(DEFAULT_PREFERENCES);

    const parsed = storedPreferencesSchema.safeParse(parseJson(raw));
    if (!parsed.success) {
      this.logger.warn('Stored preferences were unreadable; using defaults');
      return ok(DEFAULT_PREFERENCES);
    }
    return ok(parsed.data);
  }

  async save(preferences: Preferences): Promise<Result<void, AppError>> {
    try {
      await this.store.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
      return ok(undefined);
    } catch (cause) {
      return err(new AppError('storage', 'Failed to save preferences', { cause }));
    }
  }
}
