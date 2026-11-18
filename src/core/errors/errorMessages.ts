import { type AppErrorKind } from './AppError';

/** i18n key for the user-facing explanation of an error kind. */
export type ErrorMessageKey = `errors.kind.${AppErrorKind}`;

export function getErrorMessageKey(kind: AppErrorKind): ErrorMessageKey {
  return `errors.kind.${kind}`;
}

/** Kinds caused by connectivity, which deserve an "offline" visual and a retry rather than a generic error. */
export function isConnectivityError(kind: AppErrorKind): boolean {
  return kind === 'offline' || kind === 'network' || kind === 'timeout';
}

/**
 * Cancellation is a deliberate outcome (the user left the screen, a newer search
 * replaced an older one), so it should be neither shown nor reported.
 */
export function shouldReportError(kind: AppErrorKind): boolean {
  return kind !== 'cancelled';
}
