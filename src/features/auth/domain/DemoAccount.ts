import { type Credentials } from './Credentials';

/**
 * Wanderly authenticates against DummyJSON, a public demo API. It has no real
 * sign-up: only its published sample users can sign in. These credentials are
 * public by design (documented at dummyjson.com/docs/auth), not a secret.
 */
export const DEMO_CREDENTIALS: Credentials = { username: 'emilys', password: 'emilyspass' };
