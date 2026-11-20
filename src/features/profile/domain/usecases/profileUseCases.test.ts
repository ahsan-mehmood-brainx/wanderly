import { AppError } from '@/core/errors/AppError';
import { err, ok } from '@/core/result';
import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { ManualClock } from '@/testing/ManualClock';
import { FakeProfilePhotoStore, localProfile, localProfileInput } from '@/testing/profileFixtures';
import { createTestLogger } from '@/testing/testDependencies';
import {
  FakeImagePickerService,
  FakeTripOwnerProvider,
  OTHER_TRIP_OWNER,
  TRIP_OWNER,
  TRIPS_NOW,
} from '@/testing/tripFixtures';

import { StorageLocalProfileRepository } from '../../data/StorageLocalProfileRepository';
import { EMPTY_LOCAL_PROFILE, type LocalProfile } from '../LocalProfile';
import { type LocalProfileRepository } from '../repositories';
import { GetLocalProfile, PickProfilePhoto, SaveLocalProfile } from './profileUseCases';

function setup() {
  const repository: LocalProfileRepository = new StorageLocalProfileRepository(
    new InMemoryKeyValueStore(),
    createTestLogger(),
  );
  const owners = new FakeTripOwnerProvider();
  const photos = new FakeProfilePhotoStore();
  const clock = new ManualClock(TRIPS_NOW);
  return {
    repository,
    owners,
    photos,
    getProfile: new GetLocalProfile(repository, owners),
    save: new SaveLocalProfile(repository, owners, photos, clock),
  };
}

async function storedProfile(repository: LocalProfileRepository, ownerId = TRIP_OWNER): Promise<LocalProfile> {
  const result = await repository.load(ownerId);
  if (!result.ok) throw result.error;
  return result.value;
}

describe('GetLocalProfile', () => {
  it('TC-08 returns the empty profile before anything is saved', async () => {
    const { getProfile } = setup();

    await expect(getProfile.execute()).resolves.toEqual(ok(EMPTY_LOCAL_PROFILE));
  });

  it('TC-09 returns only the signed-in account’s profile', async () => {
    const { getProfile, repository, owners } = setup();
    await repository.save(TRIP_OWNER, localProfile({ displayName: 'Emily J.' }));

    owners.ownerId = OTHER_TRIP_OWNER;

    await expect(getProfile.execute()).resolves.toEqual(ok(EMPTY_LOCAL_PROFILE));
  });

  it('TC-09 is unauthorized when nobody is signed in', async () => {
    const { getProfile, owners } = setup();
    owners.ownerId = null;

    const result = await getProfile.execute();

    expect(!result.ok && result.error.kind).toBe('unauthorized');
  });
});

describe('SaveLocalProfile', () => {
  it('TC-09 saves the validated profile for the signed-in account with the save time', async () => {
    const { save, repository } = setup();

    const outcome = await save.execute(localProfileInput({ displayName: ' Emily J. ', homeBase: 'Lahore', bio: '' }));

    const expected = localProfile({ displayName: 'Emily J.', homeBase: 'Lahore', bio: null, updatedAt: TRIPS_NOW });
    expect(outcome).toEqual({ status: 'saved', profile: expected });
    expect(await storedProfile(repository)).toEqual(expected);
    expect(await storedProfile(repository, OTHER_TRIP_OWNER)).toEqual(EMPTY_LOCAL_PROFILE);
  });

  it('TC-09 saves nothing for invalid input', async () => {
    const { save, repository } = setup();

    const outcome = await save.execute(localProfileInput({ displayName: 'a'.repeat(61) }));

    expect(outcome).toEqual({ status: 'invalid', errors: { fields: { displayName: 'tooLong' } } });
    expect(await storedProfile(repository)).toEqual(EMPTY_LOCAL_PROFILE);
  });

  it('TC-09 fails as unauthorized when nobody is signed in', async () => {
    const { save, owners } = setup();
    owners.ownerId = null;

    const outcome = await save.execute(localProfileInput());

    expect(outcome.status === 'failed' && outcome.error.kind).toBe('unauthorized');
  });

  it('TC-09 copies a newly picked photo into app storage before saving it', async () => {
    const { save, repository, photos } = setup();

    await save.execute(localProfileInput({ photo: 'file:///picked/me.jpg' }));

    expect([...photos.stored]).toEqual(['profile-photos/photo-1.jpg']);
    expect((await storedProfile(repository)).photo).toBe('profile-photos/photo-1.jpg');
  });

  it('TC-09 deletes the replaced photo only after the save succeeds', async () => {
    const { save, repository, photos } = setup();
    await repository.save(TRIP_OWNER, localProfile({ displayName: 'Emily', photo: 'profile-photos/old.jpg' }));

    await save.execute(localProfileInput({ photo: 'file:///picked/new.jpg' }));

    expect((await storedProfile(repository)).photo).toBe('profile-photos/photo-1.jpg');
    expect(photos.removed).toEqual(['profile-photos/old.jpg']);
  });

  it('TC-09 deletes the photo when it is removed from the profile', async () => {
    const { save, repository, photos } = setup();
    await repository.save(TRIP_OWNER, localProfile({ displayName: 'Emily', photo: 'profile-photos/old.jpg' }));

    await save.execute(localProfileInput({ photo: null }));

    expect((await storedProfile(repository)).photo).toBeNull();
    expect(photos.removed).toEqual(['profile-photos/old.jpg']);
  });

  it('TC-09 keeps an unchanged stored photo without copying it again', async () => {
    const { save, repository, photos } = setup();
    await repository.save(TRIP_OWNER, localProfile({ displayName: 'Emily', photo: 'profile-photos/old.jpg' }));

    await save.execute(localProfileInput({ displayName: 'Em', photo: 'profile-photos/old.jpg' }));

    expect((await storedProfile(repository)).photo).toBe('profile-photos/old.jpg');
    expect(photos.stored.size).toBe(0);
    expect(photos.removed).toEqual([]);
  });

  it('TC-09 keeps an unchanged photo that is not a stored reference instead of importing it on every save', async () => {
    const { save, repository, photos } = setup();
    await repository.save(TRIP_OWNER, localProfile({ displayName: 'Emily', photo: 'file:///legacy/me.jpg' }));
    photos.failImports = true;

    const outcome = await save.execute(localProfileInput({ bio: 'Slow travel fan', photo: 'file:///legacy/me.jpg' }));

    expect(outcome.status).toBe('saved');
    expect((await storedProfile(repository)).photo).toBe('file:///legacy/me.jpg');
    expect(photos.stored.size).toBe(0);
    expect(photos.removed).toEqual([]);
  });

  it('TC-09 keeps the old photo and discards the copy when saving fails', async () => {
    const { owners, photos } = setup();
    const failing: LocalProfileRepository = {
      load: () => Promise.resolve(ok(localProfile({ displayName: 'Emily', photo: 'profile-photos/old.jpg' }))),
      save: () => Promise.resolve(err(new AppError('storage', 'disk full'))),
    };
    const save = new SaveLocalProfile(failing, owners, photos, new ManualClock(TRIPS_NOW));

    const outcome = await save.execute(localProfileInput({ photo: 'file:///picked/new.jpg' }));

    expect(outcome.status === 'failed' && outcome.error.kind).toBe('storage');
    expect(photos.removed).toEqual(['profile-photos/photo-1.jpg']);
    expect(photos.removed).not.toContain('profile-photos/old.jpg');
  });

  it('TC-09 reports a storage error and saves nothing when the photo cannot be copied', async () => {
    const { save, repository, photos } = setup();
    photos.failImports = true;

    const outcome = await save.execute(localProfileInput({ photo: 'file:///picked/me.jpg' }));

    expect(outcome.status === 'failed' && outcome.error.kind).toBe('storage');
    expect(await storedProfile(repository)).toEqual(EMPTY_LOCAL_PROFILE);
  });
});

describe('PickProfilePhoto', () => {
  it('TC-09 asks the photo library for a square photo', async () => {
    const picker = new FakeImagePickerService();
    picker.result = ok('file:///picked/me.jpg');

    await expect(new PickProfilePhoto(picker).execute()).resolves.toEqual(ok('file:///picked/me.jpg'));
    expect(picker.pickImage).toHaveBeenCalledWith({ aspect: [1, 1] });
  });

  it('TC-09 returns null when the traveller cancels', async () => {
    const picker = new FakeImagePickerService();

    await expect(new PickProfilePhoto(picker).execute()).resolves.toEqual(ok(null));
  });
});
