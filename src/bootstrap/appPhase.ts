import { type RootState } from '@/core/store/store';
import { type AuthStatus } from '@/features/auth/presentation/state/authSlice';
import { type OnboardingState } from '@/features/onboarding/presentation/state/onboardingSlice';

/**
 * Which navigation tree is reachable. Exactly one root route group is unguarded
 * per phase, so the router can never show a protected screen to the wrong user.
 */
export type AppPhase = 'splash' | 'onboarding' | 'auth' | 'app';

export interface AppPhaseInput {
  readonly authStatus: AuthStatus;
  readonly onboarding: OnboardingState;
}

/**
 * 1. Until the stored session and onboarding flag are read: the launch screen.
 * 2. A restored session wins over onboarding: someone signed in has already seen it.
 * 3. Otherwise the intro (first run), then sign-in.
 */
export function resolveAppPhase({ authStatus, onboarding }: AppPhaseInput): AppPhase {
  if (authStatus === 'idle' || authStatus === 'restoring' || onboarding.status !== 'ready') return 'splash';
  if (authStatus === 'authenticated') return 'app';
  return onboarding.completed ? 'auth' : 'onboarding';
}

export const selectAppPhase = (state: RootState): AppPhase =>
  resolveAppPhase({ authStatus: state.auth.status, onboarding: state.onboarding });
