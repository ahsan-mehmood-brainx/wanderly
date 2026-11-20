import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';
import { sessionExpired, signOut } from '@/features/auth/presentation/state/authSlice';
import { createTestStore } from '@/testing/createTestStore';
import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { ManualClock } from '@/testing/ManualClock';
import { localProfile, localProfileInput } from '@/testing/profileFixtures';
import { createTestDependencies } from '@/testing/testDependencies';
import { FakeTripOwnerProvider, OTHER_TRIP_OWNER, TRIP_OWNER, TRIPS_NOW } from '@/testing/tripFixtures';

import { localProfileStorageKey } from '../../data/StorageLocalProfileRepository';
import { EMPTY_LOCAL_PROFILE, type LocalProfile } from '../../domain/LocalProfile';
import { type SaveProfileOutcome } from '../../domain/usecases/profileUseCases';
import { loadLocalProfile, saveLocalProfile } from './profileSlice';
import {
  selectLocalProfile,
  selectLocalProfileErrorKind,
  selectLocalProfileSaving,
  selectLocalProfileStatus,
} from './selectors';

const EMILY = localProfile({ displayName: 'Emily J.', bio: 'Slow travel fan', updatedAt: TRIPS_NOW });
const SAM = localProfile({ displayName: 'Sam', updatedAt: TRIPS_NOW });

function setup() {
  const keyValueStore = new InMemoryKeyValueStore({
    [localProfileStorageKey(TRIP_OWNER)]: JSON.stringify(EMILY),
    [localProfileStorageKey(OTHER_TRIP_OWNER)]: JSON.stringify(SAM),
  });
  const owners = new FakeTripOwnerProvider();
  const dependencies = createTestDependencies({
    keyValueStore,
    tripOwnerProvider: owners,
    clock: new ManualClock(TRIPS_NOW),
  });
  return { keyValueStore, owners, dependencies, store: createTestStore(dependencies) };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe('profile state edge cases', () => {
  it('does not load while nobody is signed in, and stays idle so a later sign-in can load', async () => {
    const { store, owners } = setup();
    owners.ownerId = null;

    await store.dispatch(loadLocalProfile());
    expect(selectLocalProfileStatus(store.getState())).toBe('idle');

    owners.ownerId = TRIP_OWNER;
    await store.dispatch(loadLocalProfile());
    expect(selectLocalProfile(store.getState())).toEqual(EMILY);
  });

  it('loads only once when several screens ask at the same time', async () => {
    const { store, dependencies } = setup();
    const execute = jest.spyOn(dependencies.getLocalProfile, 'execute');

    await Promise.all([store.dispatch(loadLocalProfile()), store.dispatch(loadLocalProfile())]);
    await store.dispatch(loadLocalProfile());

    expect(execute).toHaveBeenCalledTimes(1);
    expect(selectLocalProfileStatus(store.getState())).toBe('ready');
  });

  it('a load that finishes after sign-out does not bring the previous account back', async () => {
    const { store, dependencies } = setup();
    const gate = deferred<Result<LocalProfile, AppError>>();
    jest.spyOn(dependencies.getLocalProfile, 'execute').mockReturnValueOnce(gate.promise);

    const loading = store.dispatch(loadLocalProfile());
    store.dispatch(signOut.fulfilled(undefined, 'r'));
    gate.resolve(ok(EMILY));
    await loading;

    expect(selectLocalProfile(store.getState())).toEqual(EMPTY_LOCAL_PROFILE);
    expect(selectLocalProfileStatus(store.getState())).toBe('idle');
  });

  it('after switching accounts, the next load shows only the new account’s profile', async () => {
    const { store, owners } = setup();
    await store.dispatch(loadLocalProfile());
    expect(selectLocalProfile(store.getState())).toEqual(EMILY);

    store.dispatch(sessionExpired());
    owners.ownerId = OTHER_TRIP_OWNER;
    await store.dispatch(loadLocalProfile());

    expect(selectLocalProfile(store.getState())).toEqual(SAM);
  });

  it('a failed load can be retried', async () => {
    const { store, dependencies } = setup();
    jest.spyOn(dependencies.getLocalProfile, 'execute').mockResolvedValueOnce(err(new AppError('storage', 'busy')));

    await store.dispatch(loadLocalProfile());
    expect(selectLocalProfileStatus(store.getState())).toBe('failed');
    expect(selectLocalProfileErrorKind(store.getState())).toBe('storage');

    await store.dispatch(loadLocalProfile());
    expect(selectLocalProfileStatus(store.getState())).toBe('ready');
    expect(selectLocalProfileErrorKind(store.getState())).toBeNull();
    expect(selectLocalProfile(store.getState())).toEqual(EMILY);
  });

  it('a use case that throws while loading ends in the failed state instead of loading forever', async () => {
    const { store, dependencies } = setup();
    jest.spyOn(dependencies.getLocalProfile, 'execute').mockRejectedValueOnce(new Error('boom'));

    await store.dispatch(loadLocalProfile());

    expect(selectLocalProfileStatus(store.getState())).toBe('failed');
    expect(selectLocalProfileErrorKind(store.getState())).toBe('unknown');
  });

  it('a double tap on Save writes the profile once', async () => {
    const { store, dependencies } = setup();
    await store.dispatch(loadLocalProfile());
    const execute = jest.spyOn(dependencies.saveLocalProfile, 'execute');

    const first = store.dispatch(saveLocalProfile(localProfileInput({ displayName: 'Em' })));
    expect(selectLocalProfileSaving(store.getState())).toBe(true);
    const second = await store.dispatch(saveLocalProfile(localProfileInput({ displayName: 'Emma' })));
    await first;

    expect(execute).toHaveBeenCalledTimes(1);
    expect(saveLocalProfile.rejected.match(second) && second.meta.condition).toBe(true);
    expect(selectLocalProfile(store.getState()).displayName).toBe('Em');
    expect(selectLocalProfileSaving(store.getState())).toBe(false);
  });

  it('a save that finishes after sign-out does not show the previous account’s profile', async () => {
    const { store, dependencies } = setup();
    await store.dispatch(loadLocalProfile());
    const gate = deferred<SaveProfileOutcome>();
    jest.spyOn(dependencies.saveLocalProfile, 'execute').mockReturnValueOnce(gate.promise);

    const saving = store.dispatch(saveLocalProfile(localProfileInput({ displayName: 'Em' })));
    store.dispatch(signOut.fulfilled(undefined, 'r'));
    gate.resolve({ status: 'saved', profile: localProfile({ displayName: 'Em' }) });
    await saving;

    expect(selectLocalProfile(store.getState())).toEqual(EMPTY_LOCAL_PROFILE);
    expect(selectLocalProfileSaving(store.getState())).toBe(false);
  });

  it('an invalid or failed save keeps the loaded profile and frees the form for another try', async () => {
    const { store, keyValueStore } = setup();
    await store.dispatch(loadLocalProfile());

    const invalid = await store.dispatch(saveLocalProfile(localProfileInput({ displayName: '   ' })));
    expect(saveLocalProfile.fulfilled.match(invalid) && invalid.payload.status).toBe('invalid');

    jest.spyOn(keyValueStore, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    const failed = await store.dispatch(saveLocalProfile(localProfileInput({ displayName: 'Em' })));
    expect(saveLocalProfile.fulfilled.match(failed) && failed.payload).toEqual({
      status: 'failed',
      errorKind: 'storage',
    });

    expect(selectLocalProfile(store.getState())).toEqual(EMILY);
    expect(selectLocalProfileSaving(store.getState())).toBe(false);
  });

  it('a use case that throws while saving frees the form for another try', async () => {
    const { store, dependencies } = setup();
    jest.spyOn(dependencies.saveLocalProfile, 'execute').mockRejectedValueOnce(new Error('boom'));

    const action = await store.dispatch(saveLocalProfile(localProfileInput()));

    expect(saveLocalProfile.rejected.match(action) && action.meta.condition).toBe(false);
    expect(selectLocalProfileSaving(store.getState())).toBe(false);
  });
});
