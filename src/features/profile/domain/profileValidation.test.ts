import { localProfileInput } from '@/testing/profileFixtures';

import { PROFILE_LIMITS } from './LocalProfile';
import { validateProfileInput } from './profileValidation';

describe('validateProfileInput', () => {
  it('TC-09 trims the text and turns empty optional fields into null', () => {
    const result = validateProfileInput(
      localProfileInput({ displayName: '  Emily J.  ', homeBase: '   ', bio: '  Slow travel fan ', photo: null }),
    );

    expect(result).toEqual({
      ok: true,
      draft: { displayName: 'Emily J.', homeBase: null, bio: 'Slow travel fan', photo: null },
    });
  });

  it('TC-09 keeps the photo reference as entered', () => {
    const result = validateProfileInput(localProfileInput({ photo: 'file:///picked/me.jpg' }));

    expect(result.ok && result.draft.photo).toBe('file:///picked/me.jpg');
  });

  it('TC-09 requires a display name', () => {
    expect(validateProfileInput(localProfileInput({ displayName: '   ' }))).toEqual({
      ok: false,
      errors: { fields: { displayName: 'required' } },
    });
  });

  it('TC-09 accepts a null display name, which keeps following the account name', () => {
    const result = validateProfileInput(localProfileInput({ displayName: null, bio: 'Hi' }));

    expect(result).toEqual({ ok: true, draft: { displayName: null, homeBase: null, bio: 'Hi', photo: null } });
  });

  it('TC-09 accepts names, home bases and bios right at their limits', () => {
    const result = validateProfileInput(
      localProfileInput({
        displayName: 'a'.repeat(PROFILE_LIMITS.displayNameMaxLength),
        homeBase: 'b'.repeat(PROFILE_LIMITS.homeBaseMaxLength),
        bio: 'c'.repeat(PROFILE_LIMITS.bioMaxLength),
      }),
    );

    expect(result.ok).toBe(true);
  });

  it('TC-09 rejects every field that is one character too long', () => {
    const result = validateProfileInput(
      localProfileInput({
        displayName: 'a'.repeat(61),
        homeBase: 'b'.repeat(81),
        bio: 'c'.repeat(161),
      }),
    );

    expect(result).toEqual({
      ok: false,
      errors: { fields: { displayName: 'tooLong', homeBase: 'tooLong', bio: 'tooLong' } },
    });
  });

  it('TC-09 measures the limit after trimming', () => {
    const result = validateProfileInput(localProfileInput({ displayName: `  ${'a'.repeat(60)}  ` }));

    expect(result.ok).toBe(true);
  });

  it('TC-09 counts Urdu characters, not bytes', () => {
    const result = validateProfileInput(localProfileInput({ displayName: 'ع'.repeat(60) }));

    expect(result.ok).toBe(true);
  });
});
