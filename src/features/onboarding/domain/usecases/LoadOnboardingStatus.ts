import { type Logger } from '@/core/logging/Logger';
import { type UseCase } from '@/core/usecase/UseCase';
import { TIMED_OUT, withTimeout } from '@/core/utils/async';

import { type OnboardingRepository } from '../OnboardingRepository';

export const ONBOARDING_LOAD_TIMEOUT_MS = 3000;

/**
 * Resolves whether to show the intro. Never fails: if storage is unreadable or
 * hangs, the intro is shown again, which costs one tap and never blocks launch.
 */
export class LoadOnboardingStatus implements UseCase<void, boolean> {
  constructor(
    private readonly repository: OnboardingRepository,
    private readonly logger: Logger,
    private readonly timeoutMs: number = ONBOARDING_LOAD_TIMEOUT_MS,
  ) {}

  async execute(): Promise<boolean> {
    try {
      const result = await withTimeout(this.repository.isCompleted(), this.timeoutMs);
      if (result === TIMED_OUT) this.logger.warn('Reading onboarding status timed out', { timeoutMs: this.timeoutMs });
      else if (result.ok) return result.value;
      else this.logger.error('Could not read onboarding status', result.error);
    } catch (error) {
      this.logger.error('Onboarding repository threw while loading', error);
    }
    return false;
  }
}
