export type LogContext = Readonly<Record<string, unknown>>;

/**
 * Logging/error-reporting port. The console implementation is used today;
 * a crash-reporting implementation (e.g. Sentry) can be swapped in at the
 * composition root without touching feature code.
 */
export interface Logger {
  warn(message: string, context?: LogContext): void;
  error(message: string, error: unknown, context?: LogContext): void;
}

export class ConsoleLogger implements Logger {
  constructor(private readonly enabled: boolean) {}

  warn(message: string, context?: LogContext): void {
    if (this.enabled) console.warn(`[Wanderly] ${message}`, context ?? '');
  }

  error(message: string, error: unknown, context?: LogContext): void {
    if (this.enabled) console.error(`[Wanderly] ${message}`, error, context ?? '');
  }
}
