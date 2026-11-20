import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { ManualClock } from '@/testing/ManualClock';
import { FakeProfilePhotoStore, localProfile, localProfileInput } from '@/testing/profileFixtures';
import { createTestLogger } from '@/testing/testDependencies';
import { FakeTripOwnerProvider, TRIP_OWNER, TRIPS_NOW } from '@/testing/tripFixtures';

import { EMPTY_LOCAL_PROFILE, PROFILE_LIMITS } from '../domain/LocalProfile';
import { SaveLocalProfile } from '../domain/usecases/profileUseCases';
import { localProfileStorageKey, StorageLocalProfileRepository } from './StorageLocalProfileRepository';

function setup(initial: Record<string, string> = {}) {
  const store = new InMemoryKeyValueStore(initial);
  const logger = createTestLogger();
  return { store, logger, repository: new StorageLocalProfileRepository(store, logger) };
}

/** Each globe emoji is one character but two UTF-16 code units. */
const emoji = (count: number) => '🌍'.repeat(count);

describe('StorageLocalProfileRepository edge cases', () => {
  it('keeps an emoji display name at the 60-character limit after reloading', async () => {
    const { repository } = setup();
    const saved = localProfile({ displayName: emoji(PROFILE_LIMITS.displayNameMaxLength), updatedAt: TRIPS_NOW });

    await repository.save(TRIP_OWNER, saved);

    await expect(repository.load(TRIP_OWNER)).resolves.toEqual({ ok: true, value: saved });
  });

  it('keeps an emoji home base and bio at their limits after reloading', async () => {
    const { repository } = setup();
    const saved = localProfile({
      displayName: 'Emily',
      homeBase: emoji(PROFILE_LIMITS.homeBaseMaxLength),
      bio: `Slow travel ${emoji(PROFILE_LIMITS.bioMaxLength - 'Slow travel '.length)}`,
      updatedAt: TRIPS_NOW,
    });

    await repository.save(TRIP_OWNER, saved);

    await expect(repository.load(TRIP_OWNER)).resolves.toEqual({ ok: true, value: saved });
  });

  it('keeps an Urdu display name at the limit after reloading', async () => {
    const { repository } = setup();
    const saved = localProfile({ displayName: 'ع'.repeat(PROFILE_LIMITS.displayNameMaxLength) });

    await repository.save(TRIP_OWNER, saved);

    await expect(repository.load(TRIP_OWNER)).resolves.toEqual({ ok: true, value: saved });
  });

  it('a profile the edit form accepts survives an app restart unchanged (emoji name and bio)', async () => {
    const { repository } = setup();
    const save = new SaveLocalProfile(
      repository,
      new FakeTripOwnerProvider(),
      new FakeProfilePhotoStore(),
      new ManualClock(TRIPS_NOW),
    );
    const outcome = await save.execute(
      localProfileInput({ displayName: `Ali ${emoji(50)}`, bio: emoji(PROFILE_LIMITS.bioMaxLength) }),
    );
    expect(outcome.status).toBe('saved');

    // A restart reads storage again through a fresh repository.
    const reloaded = await repository.load(TRIP_OWNER);

    expect(reloaded).toEqual({ ok: true, value: outcome.status === 'saved' ? outcome.profile : null });
  });

  it('still drops a stored display name that is over the limit in characters', async () => {
    const { repository } = setup({
      [localProfileStorageKey(TRIP_OWNER)]: JSON.stringify({
        ...EMPTY_LOCAL_PROFILE,
        displayName: emoji(PROFILE_LIMITS.displayNameMaxLength + 1),
        bio: 'kept',
      }),
    });

    await expect(repository.load(TRIP_OWNER)).resolves.toEqual({
      ok: true,
      value: { ...EMPTY_LOCAL_PROFILE, displayName: null, bio: 'kept' },
    });
  });

  it('treats a whitespace-only stored field as missing', async () => {
    const { repository } = setup({
      [localProfileStorageKey(TRIP_OWNER)]: JSON.stringify({
        ...EMPTY_LOCAL_PROFILE,
        displayName: '   ',
        homeBase: '',
      }),
    });

    await expect(repository.load(TRIP_OWNER)).resolves.toEqual({ ok: true, value: EMPTY_LOCAL_PROFILE });
  });

  it('fills in fields that are missing from an older or partial document', async () => {
    const { repository } = setup({
      [localProfileStorageKey(TRIP_OWNER)]: JSON.stringify({ displayName: 'Emily' }),
    });

    await expect(repository.load(TRIP_OWNER)).resolves.toEqual({
      ok: true,
      value: { ...EMPTY_LOCAL_PROFILE, displayName: 'Emily' },
    });
  });

  it.each(['null', '[]', '"text"', '42'])('returns the empty profile for a stored %s document', async (raw) => {
    const { repository } = setup({ [localProfileStorageKey(TRIP_OWNER)]: raw });

    await expect(repository.load(TRIP_OWNER)).resolves.toEqual({ ok: true, value: EMPTY_LOCAL_PROFILE });
  });
});
