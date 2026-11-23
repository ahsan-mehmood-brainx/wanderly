import {
  isRtlLanguage,
  isSupportedLanguage,
  LANGUAGE_NATIVE_NAMES,
  layoutDirectionOf,
  RTL_LANGUAGES,
  SUPPORTED_LANGUAGES,
} from './languages';

describe('languages', () => {
  it('TC-01 ships English, Spanish and Urdu, with Urdu as the only right-to-left language', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['en', 'es', 'ur']);
    expect(LANGUAGE_NATIVE_NAMES.ur).toBe('اردو');
    expect(isSupportedLanguage('ur')).toBe(true);
    expect(RTL_LANGUAGES).toEqual(['ur']);
  });

  it('TC-03 reports Urdu as right to left', () => {
    expect(isRtlLanguage('ur')).toBe(true);
    expect(layoutDirectionOf('ur')).toBe('rtl');
  });

  it('TC-03 reports English and Spanish as left to right', () => {
    expect(isRtlLanguage('en')).toBe(false);
    expect(isRtlLanguage('es')).toBe(false);
    expect(layoutDirectionOf('en')).toBe('ltr');
    expect(layoutDirectionOf('es')).toBe('ltr');
  });
});
