/** Produces unique identifiers. Injected so tests can use predictable, sequential ids. */
export type IdGenerator = () => string;

/**
 * Time-prefixed random id for correlating logs and requests (not for security:
 * `Math.random` is not cryptographically strong).
 */
export const randomId: IdGenerator = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`;
