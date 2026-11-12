import { type CoreDependencies } from '@/core/di/CoreDependencies';
import { type Factories } from '@/core/di/createContainer';
import { type UseCase } from '@/core/usecase/UseCase';

import { StorageOnboardingRepository } from './data/StorageOnboardingRepository';
import { type OnboardingRepository } from './domain/OnboardingRepository';
import { CompleteOnboarding } from './domain/usecases/CompleteOnboarding';
import { LoadOnboardingStatus } from './domain/usecases/LoadOnboardingStatus';

export interface OnboardingDependencies {
  readonly onboardingRepository: OnboardingRepository;
  readonly loadOnboardingStatus: UseCase<void, boolean>;
  readonly completeOnboarding: UseCase<void, void>;
}

export const onboardingFactories: Factories<OnboardingDependencies, CoreDependencies & OnboardingDependencies> = {
  onboardingRepository: (c) => new StorageOnboardingRepository(c.keyValueStore),
  loadOnboardingStatus: (c) => new LoadOnboardingStatus(c.onboardingRepository, c.logger),
  completeOnboarding: (c) => new CompleteOnboarding(c.onboardingRepository, c.logger),
};
