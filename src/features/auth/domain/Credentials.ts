export interface Credentials {
  readonly username: string;
  readonly password: string;
}

export interface RegistrationDetails {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly username: string;
  readonly password: string;
}

export type CredentialsField = keyof Credentials;
export type RegistrationField = keyof RegistrationDetails;

/** Why a field is invalid. Presentation turns each into translated copy. */
export type ValidationIssue = 'required' | 'tooShort' | 'invalid';

export type FieldErrors<F extends string> = Partial<Readonly<Record<F, ValidationIssue>>>;

export const MIN_USERNAME_LENGTH = 3;
export const MIN_PASSWORD_LENGTH = 8;

const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;
// Deliberately loose: real validation is the confirmation email, not a regex.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Usernames are trimmed (stray spaces from autofill are a common cause of failed logins); passwords never are. */
export function normalizeCredentials(credentials: Credentials): Credentials {
  return { username: credentials.username.trim(), password: credentials.password };
}

export function validateCredentials(credentials: Credentials): FieldErrors<CredentialsField> {
  return {
    ...(credentials.username.trim() === '' ? { username: 'required' as const } : null),
    ...(credentials.password === '' ? { password: 'required' as const } : null),
  };
}

export function normalizeRegistration(details: RegistrationDetails): RegistrationDetails {
  return {
    firstName: details.firstName.trim(),
    lastName: details.lastName.trim(),
    email: details.email.trim().toLowerCase(),
    username: details.username.trim(),
    password: details.password,
  };
}

export function validateRegistration(details: RegistrationDetails): FieldErrors<RegistrationField> {
  const { firstName, lastName, email, username, password } = normalizeRegistration(details);
  const errors: Partial<Record<RegistrationField, ValidationIssue>> = {};

  if (!firstName) errors.firstName = 'required';
  if (!lastName) errors.lastName = 'required';

  if (!email) errors.email = 'required';
  else if (!EMAIL_PATTERN.test(email)) errors.email = 'invalid';

  if (!username) errors.username = 'required';
  else if (username.length < MIN_USERNAME_LENGTH) errors.username = 'tooShort';
  else if (!USERNAME_PATTERN.test(username)) errors.username = 'invalid';

  if (!password) errors.password = 'required';
  else if (password.length < MIN_PASSWORD_LENGTH) errors.password = 'tooShort';

  return errors;
}

export function hasFieldErrors<F extends string>(errors: FieldErrors<F>): boolean {
  return Object.keys(errors).length > 0;
}
