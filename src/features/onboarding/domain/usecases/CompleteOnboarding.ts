import { type Logger } from '@/core/logging/Logger';
import { type UseCase } from '@/core/usecase/UseCase';

import { type OnboardingRepository } from '../OnboardingRepository';

/** Records that the intro is done. A failed write is logged, not surfaced: the worst case is seeing the intro again. */
export class CompleteOnboarding implements UseCase<void, void> {
  constructor(
    private readonly repository: OnboardingRepository,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<void> {
    try {
      const result = await this.repository.markCompleted();
      if (!result.ok) this.logger.warn('Could not save onboarding completion', { kind: result.error.kind });
    } catch (error) {
      this.logger.error('Onboarding repository threw while saving', error);
    }
  }
}
