import { AppError } from '@/core/errors/AppError';
import { err, type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';

import { type AuthRepository, type RegisteredAccount } from '../AuthRepository';
import { hasFieldErrors, normalizeRegistration, validateRegistration, type RegistrationDetails } from '../Credentials';

export interface RegisterDemoAccountInput {
  readonly details: RegistrationDetails;
  readonly signal?: AbortSignal;
}

/**
 * Demo sign-up. DummyJSON validates and echoes new users but never stores them,
 * so the account cannot be used to sign in afterwards; the UI says so up front.
 * It does not sign the user in.
 */
export class RegisterDemoAccount implements UseCase<RegisterDemoAccountInput, Result<RegisteredAccount, AppError>> {
  constructor(private readonly authRepository: Pick<AuthRepository, 'registerDemoAccount'>) {}

  async execute({ details, signal }: RegisterDemoAccountInput): Promise<Result<RegisteredAccount, AppError>> {
    const normalized = normalizeRegistration(details);
    if (hasFieldErrors(validateRegistration(normalized))) {
      return err(new AppError('badRequest', 'Registration details are incomplete'));
    }
    return this.authRepository.registerDemoAccount(normalized, signal);
  }
}
