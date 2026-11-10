/**
 * Application-level error taxonomy. Each layer maps low-level failures
 * (storage, network, parsing) into one of these kinds so the presentation
 * layer can render the right state without knowing implementation details.
 *
 * New kinds are added as features introduce new failure modes; every kind needs
 * a user-facing message in `errors.kind` in each locale (enforced by the compiler).
 */
export const APP_ERROR_KINDS = [
  'storage',
  'network',
  'offline',
  'timeout',
  'cancelled',
  'unauthorized',
  'forbidden',
  'notFound',
  'rateLimited',
  'badRequest',
  'server',
  'parse',
  'unknown',
] as const;

export type AppErrorKind = (typeof APP_ERROR_KINDS)[number];

export class AppError extends Error {
  readonly kind: AppErrorKind;

  constructor(kind: AppErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AppError';
    this.kind = kind;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Normalises anything thrown into an AppError, keeping the original as `cause`. */
export function toAppError(error: unknown, message = 'Unexpected error'): AppError {
  if (isAppError(error)) return error;
  return new AppError('unknown', error instanceof Error ? error.message : message, { cause: error });
}
