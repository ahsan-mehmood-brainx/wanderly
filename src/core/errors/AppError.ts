/**
 * Application-level error taxonomy. Each layer maps low-level failures
 * (storage, network, parsing) into one of these kinds so the presentation
 * layer can render the right state without knowing implementation details.
 *
 * New kinds are added as features introduce new failure modes.
 */
export type AppErrorKind = 'storage';

export class AppError extends Error {
  readonly kind: AppErrorKind;

  constructor(kind: AppErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AppError';
    this.kind = kind;
  }
}
