import { resolveColorScheme, resolveLanguage } from './resolvePreferences';

describe('resolveColorScheme', () => {
  it('uses an explicit preference regardless of the system scheme', () => {
    expect(resolveColorScheme('dark', 'light')).toBe('dark');
    expect(resolveColorScheme('light', 'dark')).toBe('light');
  });

  it('follows the system scheme when set to system', () => {
    expect(resolveColorScheme('system', 'dark')).toBe('dark');
    expect(resolveColorScheme('system', 'light')).toBe('light');
  });

  it('falls back to light when the system scheme is unknown', () => {
    expect(resolveColorScheme('system', null)).toBe('light');
    expect(resolveColorScheme('system', undefined)).toBe('light');
    expect(resolveColorScheme('system', 'unspecified')).toBe('light');
  });
});

describe('resolveLanguage', () => {
  it('uses an explicit preference regardless of device languages', () => {
    expect(resolveLanguage('es', ['en'])).toBe('es');
  });

  it('uses the first supported device language in preference order', () => {
    expect(resolveLanguage('system', ['de', 'es', 'en'])).toBe('es');
  });

  it('matches device language codes case-insensitively', () => {
    expect(resolveLanguage('system', ['ES'])).toBe('es');
  });

  it('falls back to English when no device language is supported', () => {
    expect(resolveLanguage('system', ['ja', null, undefined])).toBe('en');
    expect(resolveLanguage('system', [])).toBe('en');
  });
});
