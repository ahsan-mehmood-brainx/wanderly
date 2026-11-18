/**
 * Static, environment-derived configuration. Built once at the composition root
 * and injected; nothing else reads `__DEV__` or `process.env` for these values.
 *
 * Per-API settings (base URLs, keys) belong to the feature that owns the API and
 * are read from `EXPO_PUBLIC_*` variables there. Never put secrets in the bundle.
 */
export interface AppConfig {
  readonly isDev: boolean;
  readonly http: {
    /** Default per-attempt timeout. APIs and individual requests may override it. */
    readonly timeoutMs: number;
    /** Default retry budget for idempotent requests (0 disables retries). */
    readonly maxRetries: number;
  };
}

export function createAppConfig(isDev: boolean = __DEV__): AppConfig {
  return {
    isDev,
    http: { timeoutMs: 15_000, maxRetries: 2 },
  };
}
