import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';
import { type KeyValueStore } from '@/core/storage/KeyValueStore';

import { type OnboardingRepository } from '../domain/OnboardingRepository';

export const ONBOARDING_STORAGE_KEY = 'onboarding.completed.v1';

export class StorageOnboardingRepository implements OnboardingRepository {
  constructor(private readonly store: KeyValueStore) {}

  async isCompleted(): Promise<Result<boolean, AppError>> {
    try {
      return ok((await this.store.getItem(ONBOARDING_STORAGE_KEY)) === 'true');
    } catch (cause) {
      return err(new AppError('storage', 'Failed to read onboarding status', { cause }));
    }
  }

  async markCompleted(): Promise<Result<void, AppError>> {
    try {
      await this.store.setItem(ONBOARDING_STORAGE_KEY, 'true');
      return ok(undefined);
    } catch (cause) {
      return err(new AppError('storage', 'Failed to save onboarding status', { cause }));
    }
  }
}
