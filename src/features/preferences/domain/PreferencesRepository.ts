import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';

import { type Preferences } from './Preferences';

export interface PreferencesRepository {
  /** Never fails on missing or malformed data; it falls back to defaults. Fails only if storage is unreadable. */
  load(): Promise<Result<Preferences, AppError>>;
  save(preferences: Preferences): Promise<Result<void, AppError>>;
}
