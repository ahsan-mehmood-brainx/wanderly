import { hasFieldErrors, validateCredentials, validateRegistration } from './Credentials';
import { LoginAttemptLimiter } from './LoginAttemptLimiter';

describe('validateCredentials', () => {
  it('requires both fields', () => {
    expect(validateCredentials({ username: '  ', password: '' })).toEqual({
      username: 'required',
      password: 'required',
    });
    expect(hasFieldErrors(validateCredentials({ username: 'emilys', password: 'x' }))).toBe(false);
  });
});

describe('validateRegistration', () => {
  const valid = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    username: 'ada_l',
    password: '12345678',
  };

  it('accepts complete details', () => {
    expect(validateRegistration(valid)).toEqual({});
  });

  it('explains each problem', () => {
    expect(
      validateRegistration({ firstName: '', lastName: ' ', email: 'ada@', username: 'a b', password: 'short' }),
    ).toEqual({
      firstName: 'required',
      lastName: 'required',
      email: 'invalid',
      username: 'invalid',
      password: 'tooShort',
    });
    expect(validateRegistration({ ...valid, username: 'ab' }).username).toBe('tooShort');
    expect(validateRegistration({ ...valid, email: '' }).email).toBe('required');
  });
});

describe('LoginAttemptLimiter', () => {
  it('locks after the maximum consecutive failures, then unlocks', () => {
    const limiter = new LoginAttemptLimiter({ maxAttempts: 2, lockoutMs: 1000 });
    limiter.recordFailure(0);
    expect(limiter.lockedUntil(0)).toBeNull();
    limiter.recordFailure(10);
    expect(limiter.lockedUntil(10)).toBe(1010);
    expect(limiter.lockedUntil(1010)).toBeNull();
  });

  it('resets after a success', () => {
    const limiter = new LoginAttemptLimiter({ maxAttempts: 2, lockoutMs: 1000 });
    limiter.recordFailure(0);
    limiter.reset();
    limiter.recordFailure(0);
    expect(limiter.lockedUntil(0)).toBeNull();
  });
});
