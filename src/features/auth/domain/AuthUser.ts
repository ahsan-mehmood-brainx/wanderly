/** The signed-in traveller, in app vocabulary (no API field names). */
export interface AuthUser {
  readonly id: number;
  readonly username: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly imageUrl: string | null;
}

/** Full name when known, otherwise the username, so there is always something to greet. */
export function displayName(user: Pick<AuthUser, 'firstName' | 'lastName' | 'username'>): string {
  const fullName = `${user.firstName} ${user.lastName}`.trim();
  return fullName || user.username;
}
