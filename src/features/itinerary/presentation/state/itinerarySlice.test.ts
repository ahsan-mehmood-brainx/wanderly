import { AppError } from '@/core/errors/AppError';
import { err } from '@/core/result';
import { type AuthUser } from '@/features/auth/domain/AuthUser';
import { sessionExpired, signIn, signOut } from '@/features/auth/presentation/state/authSlice';
import { deleteTrip } from '@/features/trips/presentation/state/tripsSlice';
import { createTestStore } from '@/testing/createTestStore';
import { activity, activityInput, ITINERARY_TRIP, seededItineraryDatabase } from '@/testing/itineraryFixtures';
import { ManualClock } from '@/testing/ManualClock';
import { createTestDependencies } from '@/testing/testDependencies';
import { FakeTripOwnerProvider, storedTrip, TRIP_OWNER, TRIPS_NOW } from '@/testing/tripFixtures';

import { type Activity } from '../../domain/Activity';
import {
  createActivity,
  deleteActivity,
  loadItinerary,
  reorderActivities,
  setActivityCompleted,
  updateActivity,
} from './itinerarySlice';
import {
  selectActivityById,
  selectDayActivities,
  selectItineraryLoadStatus,
  selectItineraryProgress,
  selectItinerarySaving,
  selectTripActivities,
} from './selectors';

const DAY = '2027-07-01';
const museum = activity({ id: 'museum', title: 'Museum', startTime: '09:00', endTime: '11:00', sortOrder: 0 });
const lunch = activity({ id: 'lunch', title: 'Lunch', startTime: '12:00', endTime: '13:00', sortOrder: 1 });
const otherTrip = storedTrip({ id: 'trip-2', startDate: '2027-08-01', endDate: '2027-08-03' });
const otherTripActivity = activity({ id: 'elsewhere', tripId: 'trip-2', date: '2027-08-01', sortOrder: 0 });

async function setup(activities: readonly Activity[] = [museum, lunch]) {
  const storage = await seededItineraryDatabase([ITINERARY_TRIP, otherTrip], activities);
  const owners = new FakeTripOwnerProvider();
  const dependencies = createTestDependencies({
    database: storage.database,
    tripOwnerProvider: owners,
    clock: new ManualClock(TRIPS_NOW),
  });
  return { ...storage, dependencies, owners, store: createTestStore(dependencies) };
}

const dayIds = (store: Awaited<ReturnType<typeof setup>>['store'], date = DAY) =>
  selectDayActivities(store.getState(), 'trip-1', date).map(({ id }) => id);

const user: AuthUser = { id: 2, username: 'b', email: 'b@example.com', firstName: 'B', lastName: 'C', imageUrl: null };
const credentials = { username: 'b', password: 'secret' };

describe('itinerary state', () => {
  it("loads a trip's activities once", async () => {
    const { store, dependencies } = await setup();
    const getItinerary = jest.spyOn(dependencies.getItinerary, 'execute');

    await store.dispatch(loadItinerary('trip-1'));
    await store.dispatch(loadItinerary('trip-1'));

    expect(selectItineraryLoadStatus(store.getState(), 'trip-1')).toBe('ready');
    expect(dayIds(store)).toEqual(['museum', 'lunch']);
    expect(getItinerary).toHaveBeenCalledTimes(1);
  });

  it('keeps each trip separate', async () => {
    const { store } = await setup([museum, otherTripActivity]);

    await store.dispatch(loadItinerary('trip-1'));

    expect(selectTripActivities(store.getState(), 'trip-1').map(({ id }) => id)).toEqual(['museum']);
    expect(selectItineraryLoadStatus(store.getState(), 'trip-2')).toBe('idle');
    await store.dispatch(loadItinerary('trip-2'));
    expect(selectTripActivities(store.getState(), 'trip-2').map(({ id }) => id)).toEqual(['elsewhere']);
  });

  it('records a failed load and can retry', async () => {
    const { store, dependencies } = await setup();
    jest.spyOn(dependencies.getItinerary, 'execute').mockResolvedValueOnce(err(new AppError('storage', 'x')));

    await store.dispatch(loadItinerary('trip-1'));
    expect(selectItineraryLoadStatus(store.getState(), 'trip-1')).toBe('failed');
    expect(store.getState().itinerary.loadByTrip['trip-1']).toMatchObject({ errorKind: 'storage' });

    await store.dispatch(loadItinerary('trip-1'));
    expect(selectItineraryLoadStatus(store.getState(), 'trip-1')).toBe('ready');
  });

  it('mirrors a created activity after it is saved, in its position, and stays serialisable', async () => {
    const { store } = await setup();
    await store.dispatch(loadItinerary('trip-1'));

    const action = await store.dispatch(
      createActivity({
        tripId: 'trip-1',
        input: activityInput({ title: 'Coffee', startTime: '11:15', endTime: '11:45' }),
      }),
    );

    expect(action.payload).toMatchObject({ status: 'saved', activity: { title: 'Coffee' } });
    expect(selectDayActivities(store.getState(), 'trip-1', DAY).map(({ title }) => title)).toEqual([
      'Museum',
      'Coffee',
      'Lunch',
    ]);
    expect(JSON.parse(JSON.stringify(store.getState().itinerary))).toEqual(store.getState().itinerary);
  });

  it('adds nothing when the input is invalid', async () => {
    const { store } = await setup();
    await store.dispatch(loadItinerary('trip-1'));

    const action = await store.dispatch(createActivity({ tripId: 'trip-1', input: activityInput({ title: '' }) }));

    expect(action.payload).toEqual({ status: 'invalid', errors: { fields: { title: 'required' } } });
    expect(dayIds(store)).toEqual(['museum', 'lunch']);
    expect(selectItinerarySaving(store.getState())).toBe(false);
  });

  it('turns a failure into its kind', async () => {
    const { store, dependencies } = await setup();
    await store.dispatch(loadItinerary('trip-1'));
    jest.spyOn(dependencies.activityRepository, 'delete').mockResolvedValueOnce(err(new AppError('storage', 'x')));

    const action = await store.dispatch(deleteActivity('museum'));

    expect(action.payload).toEqual({ status: 'failed', errorKind: 'storage' });
    expect(selectActivityById(store.getState(), 'museum')).toBeDefined();
  });

  it('applies updates, completion and deletion', async () => {
    const { store } = await setup();
    await store.dispatch(loadItinerary('trip-1'));

    await store.dispatch(updateActivity({ id: 'museum', input: activityInput({ title: 'Gulbenkian' }) }));
    expect(selectActivityById(store.getState(), 'museum')?.title).toBe('Gulbenkian');

    expect(selectItineraryProgress(store.getState(), 'trip-1')).toEqual({ completed: 0, total: 2, ratio: 0 });
    await store.dispatch(setActivityCompleted({ id: 'lunch', completed: true }));
    expect(selectActivityById(store.getState(), 'lunch')?.isCompleted).toBe(true);
    expect(selectItineraryProgress(store.getState(), 'trip-1')).toEqual({ completed: 1, total: 2, ratio: 0.5 });

    await store.dispatch(deleteActivity('museum'));
    expect(selectActivityById(store.getState(), 'museum')).toBeUndefined();
    expect(selectItineraryProgress(store.getState(), 'trip-1')).toEqual({ completed: 1, total: 1, ratio: 1 });
  });

  it('applies a saved reorder to the day', async () => {
    const { store } = await setup();
    await store.dispatch(loadItinerary('trip-1'));

    const action = await store.dispatch(
      reorderActivities({ tripId: 'trip-1', date: DAY, orderedIds: ['lunch', 'museum'] }),
    );

    expect(action.payload).toMatchObject({ status: 'reordered' });
    expect(dayIds(store)).toEqual(['lunch', 'museum']);
    expect(selectActivityById(store.getState(), 'lunch')?.sortOrder).toBe(0);
  });

  it('keeps the previous order when a reorder fails', async () => {
    const { store, dependencies } = await setup();
    await store.dispatch(loadItinerary('trip-1'));
    jest.spyOn(dependencies.activityRepository, 'reorder').mockResolvedValueOnce(err(new AppError('storage', 'x')));

    const action = await store.dispatch(
      reorderActivities({ tripId: 'trip-1', date: DAY, orderedIds: ['lunch', 'museum'] }),
    );

    expect(action.payload).toEqual({ status: 'failed', errorKind: 'storage' });
    expect(dayIds(store)).toEqual(['museum', 'lunch']);
    expect(selectItinerarySaving(store.getState())).toBe(false);
  });

  it('runs one change at a time, so a double tap creates one activity', async () => {
    const { store, activityRepository } = await setup([]);
    const [first, second] = await Promise.all([
      store.dispatch(createActivity({ tripId: 'trip-1', input: activityInput() })),
      store.dispatch(createActivity({ tripId: 'trip-1', input: activityInput({ title: 'Twin' }) })),
    ]);

    expect(createActivity.fulfilled.match(first)).toBe(true);
    expect(createActivity.rejected.match(second) && second.meta.condition).toBe(true);
    const saved = await activityRepository.listByTrip(TRIP_OWNER, 'trip-1');
    expect(saved.ok && saved.value).toHaveLength(1);
    expect(selectItinerarySaving(store.getState())).toBe(false);
  });

  it('releases the save lock after an unexpected throw', async () => {
    const { store, dependencies } = await setup([]);
    jest.spyOn(dependencies.createActivity, 'execute').mockRejectedValueOnce(new Error('bug'));
    await store.dispatch(createActivity({ tripId: 'trip-1', input: activityInput() }));
    expect(selectItinerarySaving(store.getState())).toBe(false);
  });

  it("drops a deleted trip's activities and keeps other trips'", async () => {
    const { store } = await setup([museum, lunch, otherTripActivity]);
    await store.dispatch(loadItinerary('trip-1'));
    await store.dispatch(loadItinerary('trip-2'));

    await store.dispatch(deleteTrip('trip-1'));

    expect(selectTripActivities(store.getState(), 'trip-1')).toEqual([]);
    expect(selectActivityById(store.getState(), 'museum')).toBeUndefined();
    expect(selectItineraryLoadStatus(store.getState(), 'trip-1')).toBe('idle');
    expect(selectTripActivities(store.getState(), 'trip-2').map(({ id }) => id)).toEqual(['elsewhere']);
  });

  it('keeps the activities when deleting the trip fails', async () => {
    const { store, dependencies } = await setup();
    await store.dispatch(loadItinerary('trip-1'));
    jest.spyOn(dependencies.tripRepository, 'delete').mockResolvedValueOnce(err(new AppError('storage', 'x')));

    await store.dispatch(deleteTrip('trip-1'));

    expect(dayIds(store)).toEqual(['museum', 'lunch']);
  });

  it('adds nothing for a trip deleted while the activity was being saved', async () => {
    const { store, tripRepository } = await setup([]);
    await tripRepository.delete(TRIP_OWNER, 'trip-1');

    const action = await store.dispatch(createActivity({ tripId: 'trip-1', input: activityInput() }));

    expect(action.payload).toEqual({ status: 'failed', errorKind: 'notFound' });
    expect(selectTripActivities(store.getState(), 'trip-1')).toEqual([]);
  });

  describe('when the account changes', () => {
    it.each([
      ['sign-out', signOut.fulfilled(undefined, 'r')],
      ['a failed sign-out', signOut.rejected(new Error('x'), 'r')],
      ['session expiry', sessionExpired()],
      ['a new sign-in', signIn.fulfilled(user, 'r', credentials)],
    ])('forgets the activities on %s', async (_name, action) => {
      const { store } = await setup();
      await store.dispatch(loadItinerary('trip-1'));

      store.dispatch(action);

      expect(selectTripActivities(store.getState(), 'trip-1')).toEqual([]);
      expect(selectItineraryLoadStatus(store.getState(), 'trip-1')).toBe('idle');
    });

    it('stays idle while signed out, so the next sign-in loads', async () => {
      const { store, owners, dependencies } = await setup();
      const getItinerary = jest.spyOn(dependencies.getItinerary, 'execute');
      owners.ownerId = null;

      await store.dispatch(loadItinerary('trip-1'));

      expect(getItinerary).not.toHaveBeenCalled();
      expect(selectItineraryLoadStatus(store.getState(), 'trip-1')).toBe('idle');
    });

    it('ignores a load that finishes after sign-out', async () => {
      const { store } = await setup();
      const loading = store.dispatch(loadItinerary('trip-1'));

      store.dispatch(signOut.fulfilled(undefined, 'r'));
      await loading;

      expect(selectTripActivities(store.getState(), 'trip-1')).toEqual([]);
      expect(selectItineraryLoadStatus(store.getState(), 'trip-1')).toBe('idle');
    });

    it('ignores a change that finishes after sign-out, and allows new ones', async () => {
      const { store } = await setup([]);
      const saving = store.dispatch(createActivity({ tripId: 'trip-1', input: activityInput() }));

      store.dispatch(signOut.fulfilled(undefined, 'r'));
      expect(selectItinerarySaving(store.getState())).toBe(false);
      await saving;

      expect(selectTripActivities(store.getState(), 'trip-1')).toEqual([]);
      expect(selectItinerarySaving(store.getState())).toBe(false);
    });
  });
});
