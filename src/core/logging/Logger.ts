import { type Clock, systemClock } from '@/core/utils/Clock';
import { redact } from '@/core/utils/redact';

export type LogContext = Readonly<Record<string, unknown>>;

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * Logging/error-reporting port. Feature code depends on this interface only;
 * where records go is decided by the transports wired at the composition root.
 */
export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error: unknown, context?: LogContext): void;
  /** Returns a logger that adds `context` to every record (e.g. `{ scope: 'http' }`). */
  child(context: LogContext): Logger;
}

export interface LogRecord {
  readonly level: LogLevel;
  readonly message: string;
  readonly timestamp: number;
  /** Already redacted. */
  readonly context: LogContext;
  readonly error?: unknown;
}

/**
 * Strategy for where log records go (console in development; a crash reporter
 * such as Sentry in production). Add a destination by adding a transport:
 * no logger or feature code changes (Open/Closed).
 */
export interface LogTransport {
  write(record: LogRecord): void;
}

export interface AppLoggerOptions {
  readonly transports: readonly LogTransport[];
  /** Records below this level are dropped before reaching any transport. */
  readonly minLevel?: LogLevel;
  readonly context?: LogContext;
  readonly clock?: Clock;
}

const levelRank = (level: LogLevel) => LOG_LEVELS.indexOf(level);

export class AppLogger implements Logger {
  private readonly transports: readonly LogTransport[];
  private readonly minRank: number;
  private readonly context: LogContext;
  private readonly clock: Clock;

  constructor(options: AppLoggerOptions) {
    this.transports = options.transports;
    this.minRank = levelRank(options.minLevel ?? 'debug');
    this.context = options.context ?? {};
    this.clock = options.clock ?? systemClock;
  }

  debug(message: string, context?: LogContext): void {
    this.write('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.write('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.write('warn', message, context);
  }

  error(message: string, error: unknown, context?: LogContext): void {
    this.write('error', message, context, error);
  }

  child(context: LogContext): Logger {
    return new AppLogger({
      transports: this.transports,
      minLevel: LOG_LEVELS[this.minRank],
      context: { ...this.context, ...context },
      clock: this.clock,
    });
  }

  private write(level: LogLevel, message: string, context: LogContext | undefined, error?: unknown): void {
    if (levelRank(level) < this.minRank || this.transports.length === 0) return;

    const record: LogRecord = {
      level,
      message,
      timestamp: this.clock.now(),
      context: redact({ ...this.context, ...context }) as LogContext,
      ...(error === undefined ? {} : { error }),
    };
    for (const transport of this.transports) {
      // Logging must never crash the app; a failing transport is skipped.
      try {
        transport.write(record);
      } catch {
        // Nowhere safe to report this.
      }
    }
  }
}

/** Development transport: prints to the Metro / browser console. */
export class ConsoleTransport implements LogTransport {
  write({ level, message, context, error }: LogRecord): void {
    const hasContext = Object.keys(context).length > 0;
    const args: unknown[] = [`[Wanderly] ${message}`];
    if (error !== undefined) args.push(error);
    if (hasContext) args.push(context);
    console[level](...args);
  }
}
