import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';
import { deleteTrip } from '@/features/trips/presentation/state/tripsSlice';
import { createTestStore } from '@/testing/createTestStore';
import { activity, activityInput, ITINERARY_TRIP, seededItineraryDatabase } from '@/testing/itineraryFixtures';
import { ManualClock } from '@/testing/ManualClock';
import { createTestDependencies } from '@/testing/testDependencies';
import { FakeTripOwnerProvider, TRIP_OWNER, TRIPS_NOW } from '@/testing/tripFixtures';

import { type Activity } from '../../domain/Activity';
import {
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
  selectItinerarySaving,
  selectTripActivities,
} from './selectors';

const DAY = '2027-07-01';
const DAY_2 = '2027-07-02';
const a = activity({ id: 'a', title: 'A', startTime: '09:00', endTime: '10:00', sortOrder: 0 });
const b = activity({ id: 'b', title: 'B', startTime: '11:00', endTime: '12:00', sortOrder: 1 });
const c = activity({ id: 'c', title: 'C', startTime: '13:00', endTime: '14:00', sortOrder: 2 });
const x = activity({ id: 'x', title: 'X', date: DAY_2, startTime: '10:00', endTime: '11:00', sortOrder: 0 });

async function setup(activities: readonly Activity[] = [a, b, c, x]) {
  const storage = await seededItineraryDatabase([ITINERARY_TRIP], activities);
  const dependencies = createTestDependencies({
    database: storage.database,
    tripOwnerProvider: new FakeTripOwnerProvider(),
    clock: new ManualClock(TRIPS_NOW),
  });
  const store = createTestStore(dependencies);
  return { ...storage, dependencies, store };
}

type Store = Awaited<ReturnType<typeof setup>>['store'];

/** `[id, sortOrder]` for a day, in display order. */
const positions = (store: Store, date = DAY) =>
  selectDayActivities(store.getState(), 'trip-1', date).map(({ id, sortOrder }) => [id, sortOrder]);

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('itinerary state edge cases', () => {
  it('renumbers both days in the store when an activity moves to another day, matching SQLite', async () => {
    const { store, activityRepository } = await setup();
    await store.dispatch(loadItinerary('trip-1'));

    await store.dispatch(
      updateActivity({
        id: 'a',
        input: activityInput({ title: 'A', date: DAY_2, startTime: '09:00', endTime: '10:00' }),
      }),
    );

    expect(positions(store)).toEqual([
      ['b', 0],
      ['c', 1],
    ]);
    expect(positions(store, DAY_2)).toEqual([
      ['a', 0],
      ['x', 1],
    ]);
    const saved = await activityRepository.listByTrip(TRIP_OWNER, 'trip-1');
    expect(saved.ok).toBe(true);
    if (saved.ok) {
      const stored = Object.fromEntries(saved.value.map(({ id, sortOrder }) => [id, sortOrder]));
      expect(
        Object.fromEntries(
          selectTripActivities(store.getState(), 'trip-1').map(({ id, sortOrder }) => [id, sortOrder]),
        ),
      ).toEqual(stored);
    }
  });

  it('closes the gap in the store when an activity in the middle is deleted', async () => {
    const { store } = await setup();
    await store.dispatch(loadItinerary('trip-1'));

    await store.dispatch(deleteActivity('b'));

    expect(positions(store)).toEqual([
      ['a', 0],
      ['c', 1],
    ]);
  });

  it('ignores a load that finishes after its trip was deleted', async () => {
    const { store, dependencies } = await setup();
    const pending = deferred<Result<readonly Activity[], AppError>>();
    jest.spyOn(dependencies.getItinerary, 'execute').mockReturnValueOnce(pending.promise);

    const loading = store.dispatch(loadItinerary('trip-1'));
    store.dispatch(deleteTrip.fulfilled({ status: 'deleted', id: 'trip-1' }, 'r', 'trip-1'));
    pending.resolve(ok([a, b]));
    await loading;

    expect(selectTripActivities(store.getState(), 'trip-1')).toEqual([]);
    expect(selectItineraryLoadStatus(store.getState(), 'trip-1')).toBe('idle');
  });

  it('does not bring back an activity whose change finishes after its trip was deleted', async () => {
    const { store, dependencies } = await setup();
    await store.dispatch(loadItinerary('trip-1'));
    const pending = deferred<Result<Activity, AppError>>();
    jest.spyOn(dependencies.setActivityCompleted, 'execute').mockReturnValueOnce(pending.promise);

    const saving = store.dispatch(setActivityCompleted({ id: 'a', completed: true }));
    store.dispatch(deleteTrip.fulfilled({ status: 'deleted', id: 'trip-1' }, 'r', 'trip-1'));
    pending.resolve(ok({ ...a, isCompleted: true }));
    await saving;

    expect(selectActivityById(store.getState(), 'a')).toBeUndefined();
    expect(selectTripActivities(store.getState(), 'trip-1')).toEqual([]);
    expect(selectItinerarySaving(store.getState())).toBe(false);
  });

  it('refuses a completion toggle while a reorder is saving, and then accepts one', async () => {
    const { store, dependencies } = await setup();
    await store.dispatch(loadItinerary('trip-1'));
    const pending = deferred<Result<readonly Activity[], AppError>>();
    jest.spyOn(dependencies.reorderActivities, 'execute').mockReturnValueOnce(pending.promise);

    const reordering = store.dispatch(reorderActivities({ tripId: 'trip-1', date: DAY, orderedIds: ['c', 'b', 'a'] }));
    const toggle = await store.dispatch(setActivityCompleted({ id: 'a', completed: true }));
    expect(setActivityCompleted.rejected.match(toggle) && toggle.meta.condition).toBe(true);

    pending.resolve(err(new AppError('storage', 'x')));
    await reordering;
    expect(positions(store).map(([id]) => id)).toEqual(['a', 'b', 'c']);

    await store.dispatch(setActivityCompleted({ id: 'a', completed: true }));
    expect(selectActivityById(store.getState(), 'a')?.isCompleted).toBe(true);
  });

  it('keeps the order when a reorder is refused because the day changed meanwhile', async () => {
    const { store, activityRepository } = await setup();
    await store.dispatch(loadItinerary('trip-1'));
    // Another screen or a stale list: the day no longer has 'b'.
    await activityRepository.delete(TRIP_OWNER, 'b');

    const action = await store.dispatch(
      reorderActivities({ tripId: 'trip-1', date: DAY, orderedIds: ['c', 'b', 'a'] }),
    );

    expect(action.payload).toEqual({ status: 'failed', errorKind: 'notFound' });
    expect(positions(store).map(([id]) => id)).toEqual(['a', 'b', 'c']);
    expect(selectItinerarySaving(store.getState())).toBe(false);
  });
});
