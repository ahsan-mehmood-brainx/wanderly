import { REDACTED, redact } from './redact';

describe('redact', () => {
  it('masks sensitive keys at any depth, case-insensitively', () => {
    expect(
      redact({
        url: '/places',
        apiKey: 'k',
        headers: { Authorization: 'Bearer t', Accept: 'application/json' },
        users: [{ password: 'p', name: 'Ada' }],
      }),
    ).toEqual({
      url: '/places',
      apiKey: REDACTED,
      headers: { Authorization: REDACTED, Accept: 'application/json' },
      users: [{ password: REDACTED, name: 'Ada' }],
    });
  });

  it('masks password-like and passport keys but not other "pass" words', () => {
    expect(
      redact({
        newPassword: 'p',
        passwd: 'p',
        passcode: '1234',
        passportNumber: 'X123',
        passengers: 2,
        passengerCount: 2,
      }),
    ).toEqual({
      newPassword: REDACTED,
      passwd: REDACTED,
      passcode: REDACTED,
      passportNumber: REDACTED,
      passengers: 2,
      passengerCount: 2,
    });
  });

  it('leaves primitives and errors untouched', () => {
    const error = new Error('x');
    expect(redact('text')).toBe('text');
    expect(redact(null)).toBeNull();
    expect(redact(error)).toBe(error);
  });

  it('truncates very deep (or cyclic) structures instead of recursing forever', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(JSON.stringify(redact(cyclic))).toContain('[Truncated]');
  });

  it('does not mutate the input', () => {
    const input = { token: 'secret' };
    redact(input);
    expect(input.token).toBe('secret');
  });
});
