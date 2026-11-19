import { AppError } from '@/core/errors/AppError';
import { err } from '@/core/result';
import { type AuthUser } from '@/features/auth/domain/AuthUser';
import { sessionExpired, signIn, signOut } from '@/features/auth/presentation/state/authSlice';
import { createTestStore } from '@/testing/createTestStore';
import { ManualClock } from '@/testing/ManualClock';
import { createTestDependencies } from '@/testing/testDependencies';
import {
  FakeTripOwnerProvider,
  OTHER_TRIP_OWNER,
  seededTripDatabase,
  storedTrip,
  tripInput,
  TRIP_OWNER,
  TRIPS_NOW,
  TRIPS_TODAY,
} from '@/testing/tripFixtures';

import { selectStoredTripById, selectTripCount, selectTripGroups, selectTripsSaving } from './selectors';
import { createTrip, deleteTrip, loadTrips, setTripCancelled, updateTrip } from './tripsSlice';

async function setup(trips = [storedTrip()]) {
  const { database, repository } = await seededTripDatabase(trips);
  const owners = new FakeTripOwnerProvider();
  const dependencies = createTestDependencies({
    database,
    tripOwnerProvider: owners,
    clock: new ManualClock(TRIPS_NOW),
  });
  return { dependencies, owners, repository, store: createTestStore(dependencies) };
}

const user: AuthUser = { id: 2, username: 'b', email: 'b@example.com', firstName: 'B', lastName: 'C', imageUrl: null };
const credentials = { username: 'b', password: 'secret' };

describe('trips state', () => {
  it('loads saved trips once', async () => {
    const { store, dependencies } = await setup();
    const getTrips = jest.spyOn(dependencies.getTrips, 'execute');

    await store.dispatch(loadTrips());
    await store.dispatch(loadTrips());

    expect(selectTripCount(store.getState())).toBe(1);
    expect(store.getState().trips.status).toBe('ready');
    expect(getTrips).toHaveBeenCalledTimes(1);
  });

  it('records a failed load and can retry', async () => {
    const { store, dependencies } = await setup();
    jest.spyOn(dependencies.getTrips, 'execute').mockResolvedValueOnce(err(new AppError('storage', 'x')));

    await store.dispatch(loadTrips());
    expect(store.getState().trips).toMatchObject({ status: 'failed', errorKind: 'storage' });

    await store.dispatch(loadTrips());
    expect(store.getState().trips).toMatchObject({ status: 'ready', errorKind: null });
  });

  it('mirrors a created trip after it is saved, and keeps the store serialisable', async () => {
    const { store } = await setup([]);
    const action = await store.dispatch(createTrip(tripInput()));
    expect(action.payload).toMatchObject({ status: 'saved' });
    expect(selectTripCount(store.getState())).toBe(1);
    expect(JSON.parse(JSON.stringify(store.getState().trips))).toEqual(store.getState().trips);
  });

  it('adds nothing when the input is invalid', async () => {
    const { store } = await setup([]);
    const action = await store.dispatch(createTrip(tripInput({ title: '' })));
    expect(action.payload).toMatchObject({ status: 'invalid', errors: { fields: { title: 'required' } } });
    expect(selectTripCount(store.getState())).toBe(0);
    expect(selectTripsSaving(store.getState())).toBe(false);
  });

  it('turns a failure into its kind', async () => {
    const { store, dependencies } = await setup();
    await store.dispatch(loadTrips());
    jest.spyOn(dependencies.tripRepository, 'delete').mockResolvedValueOnce(err(new AppError('storage', 'x')));

    const action = await store.dispatch(deleteTrip('trip-1'));

    expect(action.payload).toEqual({ status: 'failed', errorKind: 'storage' });
    expect(selectTripCount(store.getState())).toBe(1);
  });

  it('applies updates, cancellation and deletion', async () => {
    const { store } = await setup();
    await store.dispatch(loadTrips());

    await store.dispatch(updateTrip({ id: 'trip-1', input: tripInput({ title: 'Porto' }) }));
    expect(selectStoredTripById(store.getState(), 'trip-1')?.title).toBe('Porto');

    await store.dispatch(setTripCancelled({ id: 'trip-1', cancelled: true }));
    expect(selectTripGroups(store.getState(), TRIPS_TODAY).cancelled).toHaveLength(1);

    await store.dispatch(deleteTrip('trip-1'));
    expect(selectTripCount(store.getState())).toBe(0);
  });

  it('runs one change at a time, so a double tap creates one trip', async () => {
    const { store } = await setup([]);
    const [first, second] = await Promise.all([
      store.dispatch(createTrip(tripInput())),
      store.dispatch(createTrip(tripInput({ title: 'Twin' }))),
    ]);
    expect(createTrip.fulfilled.match(first)).toBe(true);
    expect(createTrip.rejected.match(second) && second.meta.condition).toBe(true);
    expect(selectTripCount(store.getState())).toBe(1);
    expect(selectTripsSaving(store.getState())).toBe(false);
  });

  it('releases the save lock after an unexpected throw', async () => {
    const { store, dependencies } = await setup([]);
    jest.spyOn(dependencies.createTrip, 'execute').mockRejectedValueOnce(new Error('bug'));
    await store.dispatch(createTrip(tripInput()));
    expect(selectTripsSaving(store.getState())).toBe(false);
  });

  it('groups by the status on the given day, in display order', async () => {
    const { store } = await setup([
      storedTrip({ id: 'a', startDate: '2027-07-10', endDate: '2027-07-12' }),
      storedTrip({ id: 'b', startDate: '2027-07-01', endDate: '2027-07-03' }),
    ]);
    await store.dispatch(loadTrips());

    expect(selectTripGroups(store.getState(), TRIPS_TODAY).upcoming.map(({ id }) => id)).toEqual(['b', 'a']);

    const later = selectTripGroups(store.getState(), '2027-07-02');
    expect(later.ongoing.map(({ id, status }) => [id, status])).toEqual([['b', 'ongoing']]);
    expect(later.upcoming.map(({ id }) => id)).toEqual(['a']);
  });

  describe('when the account changes', () => {
    it.each([
      ['sign-out', signOut.fulfilled(undefined, 'r')],
      ['a failed sign-out', signOut.rejected(new Error('x'), 'r')],
      ['session expiry', sessionExpired()],
      ['a new sign-in', signIn.fulfilled(user, 'r', credentials)],
    ])('forgets the trips on %s', async (_name, action) => {
      const { store } = await setup();
      await store.dispatch(loadTrips());

      store.dispatch(action);

      expect(selectTripCount(store.getState())).toBe(0);
      expect(store.getState().trips.status).toBe('idle');
    });

    it("loads only the next account's trips", async () => {
      const { store, owners, repository } = await setup();
      await repository.insert(OTHER_TRIP_OWNER, storedTrip({ id: 'theirs' }));
      await store.dispatch(loadTrips());
      expect(selectStoredTripById(store.getState(), 'trip-1')).toBeDefined();

      owners.ownerId = null;
      store.dispatch(signOut.fulfilled(undefined, 'r'));
      owners.ownerId = OTHER_TRIP_OWNER;
      store.dispatch(signIn.fulfilled(user, 'r', credentials));
      await store.dispatch(loadTrips());

      expect(selectStoredTripById(store.getState(), 'trip-1')).toBeUndefined();
      expect(selectStoredTripById(store.getState(), 'theirs')).toBeDefined();
    });

    it('stays idle while signed out, so the next sign-in loads', async () => {
      const { store, owners, dependencies } = await setup();
      const getTrips = jest.spyOn(dependencies.getTrips, 'execute');
      owners.ownerId = null;

      await store.dispatch(loadTrips());

      expect(getTrips).not.toHaveBeenCalled();
      expect(store.getState().trips.status).toBe('idle');
    });

    it('ignores a load that finishes after sign-out', async () => {
      const { store } = await setup();
      const loading = store.dispatch(loadTrips());

      store.dispatch(signOut.fulfilled(undefined, 'r'));
      await loading;

      expect(selectTripCount(store.getState())).toBe(0);
      expect(store.getState().trips.status).toBe('idle');
    });

    it('ignores a change that finishes after sign-out, and allows new ones', async () => {
      const { store, repository } = await setup([]);
      const saving = store.dispatch(createTrip(tripInput()));

      store.dispatch(signOut.fulfilled(undefined, 'r'));
      expect(selectTripsSaving(store.getState())).toBe(false);
      await saving;

      expect(selectTripCount(store.getState())).toBe(0);
      expect(selectTripsSaving(store.getState())).toBe(false);
      // It was still saved for the account that made it.
      const saved = await repository.list(TRIP_OWNER);
      expect(saved.ok && saved.value).toHaveLength(1);
    });
  });
});
