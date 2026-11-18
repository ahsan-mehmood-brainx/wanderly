export const REDACTED = '[REDACTED]';

/*
 * Substring match, so `accessToken` or `clientSecret` are caught too. "pass" is
 * spelled out per word because a bare `pass` would also mask travel data such
 * as `passengers`; `passport` stays masked because passport numbers are PII.
 */
const SENSITIVE_KEY =
  /passw(or)?d|passcode|passphrase|passport|pwd|secret|token|authorization|cookie|api[-_]?key|credential/i;
const MAX_DEPTH = 5;

/**
 * Returns a copy of `value` with sensitive-looking keys masked, so credentials
 * never reach logs or crash reports. Arrays and nested objects are walked up to
 * a fixed depth; deeper values are replaced rather than risking huge or cyclic output.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Error) return value;
  if (depth >= MAX_DEPTH) return '[Truncated]';
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(item, depth + 1);
  }
  return result;
}
