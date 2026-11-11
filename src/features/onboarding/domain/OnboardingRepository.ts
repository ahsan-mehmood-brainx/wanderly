import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';

/** Whether this installation has finished (or skipped) the intro. Not sensitive, so plain storage is fine. */
export interface OnboardingRepository {
  isCompleted(): Promise<Result<boolean, AppError>>;
  markCompleted(): Promise<Result<void, AppError>>;
}
