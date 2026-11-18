import { type AppIconName } from '@/shared/ui';

export type OnboardingSlideId = 'discover' | 'plan' | 'budget';

export interface OnboardingSlide {
  readonly id: OnboardingSlideId;
  readonly icon: AppIconName;
  readonly primaryChipIcon: AppIconName;
  readonly secondaryChipIcon: AppIconName;
}

/** Order matters: discover → plan → manage spending mirrors how a trip comes together. Copy lives in `onboarding.slides.<id>`. */
export const ONBOARDING_SLIDES: readonly OnboardingSlide[] = [
  { id: 'discover', icon: 'explore', primaryChipIcon: 'location', secondaryChipIcon: 'star' },
  { id: 'plan', icon: 'map', primaryChipIcon: 'calendar', secondaryChipIcon: 'flight' },
  { id: 'budget', icon: 'wallet', primaryChipIcon: 'pieChart', secondaryChipIcon: 'globe' },
];
