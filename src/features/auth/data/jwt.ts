/**
 * Reads the `exp` claim (as epoch ms) from a JWT, or `null` if the token isn't a
 * readable JWT. The signature is deliberately not verified: the client only uses
 * expiry as a scheduling hint, and the server remains the authority on validity.
 */
export function readJwtExpiry(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const claims: unknown = JSON.parse(atob(padded));
    if (typeof claims !== 'object' || claims === null || !('exp' in claims)) return null;
    return typeof claims.exp === 'number' && Number.isFinite(claims.exp) ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}
