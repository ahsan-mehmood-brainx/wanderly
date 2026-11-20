import { AppError } from '@/core/errors/AppError';
import { err } from '@/core/result';
import { activity, activityInput, ITINERARY_TRIP, seededItineraryDatabase } from '@/testing/itineraryFixtures';
import { ManualClock, sequentialIds } from '@/testing/ManualClock';
import { FakeTripOwnerProvider, OTHER_TRIP_OWNER, TRIP_OWNER, TRIPS_NOW } from '@/testing/tripFixtures';

import { type Activity } from '../Activity';
import { type ActivityRepository } from '../repositories';
import {
  CreateActivity,
  DeleteActivity,
  GetActivity,
  GetItinerary,
  ReorderActivities,
  SetActivityCompleted,
  UpdateActivity,
} from './activityUseCases';

const storageFailure = () => err(new AppError('storage', 'disk full'));

async function setup(activities: readonly Activity[] = [], trips = [ITINERARY_TRIP]) {
  const { activityRepository, tripRepository } = await seededItineraryDatabase(trips, activities);
  const clock = new ManualClock(TRIPS_NOW);
  const owners = new FakeTripOwnerProvider();
  return {
    activityRepository: activityRepository as ActivityRepository,
    tripRepository,
    clock,
    owners,
    getItinerary: new GetItinerary(activityRepository, tripRepository, owners),
    getActivity: new GetActivity(activityRepository, owners),
    create: new CreateActivity(activityRepository, tripRepository, owners, clock, sequentialIds('act')),
    update: new UpdateActivity(activityRepository, tripRepository, owners, clock),
    remove: new DeleteActivity(activityRepository, owners),
    setCompleted: new SetActivityCompleted(activityRepository, owners, clock),
    reorder: new ReorderActivities(activityRepository, owners, clock),
  };
}

async function saved(repository: ActivityRepository, tripId = 'trip-1') {
  const result = await repository.listByTrip(TRIP_OWNER, tripId);
  if (!result.ok) throw result.error;
  return result.value;
}

async function dayIds(repository: ActivityRepository, date = '2027-07-01') {
  return (await saved(repository)).filter((item) => item.date === date).map(({ id }) => id);
}

const museum = activity({ id: 'museum', title: 'Museum', startTime: '09:00', endTime: '11:00', sortOrder: 0 });
const dinner = activity({ id: 'dinner', title: 'Dinner', startTime: '19:00', endTime: '21:00', sortOrder: 1 });

describe('GetItinerary / GetActivity', () => {
  it("returns the trip's activities by day and position", async () => {
    const { getItinerary } = await setup([
      museum,
      dinner,
      activity({ id: 'next-day', date: '2027-07-02', sortOrder: 0 }),
    ]);
    const result = await getItinerary.execute('trip-1');
    expect(result.ok && result.value.map(({ id }) => id)).toEqual(['museum', 'dinner', 'next-day']);
  });

  it('reports a trip that does not exist', async () => {
    const { getItinerary } = await setup([], []);
    const result = await getItinerary.execute('gone');
    expect(!result.ok && result.error.kind).toBe('notFound');
  });

  it('finds one activity, or reports it missing', async () => {
    const { getActivity } = await setup([museum]);
    const found = await getActivity.execute('museum');
    expect(found.ok && found.value.title).toBe('Museum');
    const missing = await getActivity.execute('nope');
    expect(!missing.ok && missing.error.kind).toBe('notFound');
  });
});

describe('CreateActivity', () => {
  it('saves a valid activity with a generated id and timestamps', async () => {
    const { create, activityRepository } = await setup();
    const outcome = await create.execute({
      tripId: 'trip-1',
      input: activityInput({ title: ' Museum ', estimatedCost: '25.50', address: 'Praça do Império' }),
    });

    expect(outcome).toEqual({
      status: 'saved',
      activity: expect.objectContaining({
        id: 'act-1',
        tripId: 'trip-1',
        title: 'Museum',
        estimatedCost: 2550,
        currency: 'USD',
        address: 'Praça do Império',
        sortOrder: 0,
        isCompleted: false,
        createdAt: TRIPS_NOW,
        updatedAt: TRIPS_NOW,
      }),
    });
    expect(await saved(activityRepository)).toEqual([outcome.status === 'saved' && outcome.activity]);
  });

  it('places a new activity by its start time', async () => {
    const { create, activityRepository } = await setup([museum, dinner]);
    await create.execute({
      tripId: 'trip-1',
      input: activityInput({ title: 'Lunch', startTime: '12:30', endTime: '13:30' }),
    });
    await create.execute({
      tripId: 'trip-1',
      input: activityInput({ title: 'Breakfast', startTime: '07:30', endTime: '08:00' }),
    });
    await create.execute({
      tripId: 'trip-1',
      input: activityInput({ title: 'Souvenirs', startTime: null, endTime: null }),
    });

    expect(await dayIds(activityRepository)).toEqual(['act-2', 'museum', 'act-1', 'dinner', 'act-3']);
    expect((await saved(activityRepository)).map(({ sortOrder }) => sortOrder)).toEqual([0, 1, 2, 3, 4]);
  });

  it('saves nothing when the input is invalid', async () => {
    const { create, activityRepository } = await setup();
    const outcome = await create.execute({
      tripId: 'trip-1',
      input: activityInput({ title: '', startTime: '11:00', endTime: '10:00' }),
    });

    expect(outcome).toEqual({
      status: 'invalid',
      errors: { fields: { title: 'required', endTime: 'invalidRange' } },
    });
    expect(await saved(activityRepository)).toEqual([]);
  });

  it('refuses a day outside the trip', async () => {
    const { create, activityRepository } = await setup();
    const outcome = await create.execute({ tripId: 'trip-1', input: activityInput({ date: '2027-07-06' }) });
    expect(outcome).toEqual({ status: 'invalid', errors: { fields: { date: 'outsideTrip' } } });
    expect(await saved(activityRepository)).toEqual([]);
  });

  it('refuses an exact duplicate and names the existing activity', async () => {
    const { create, activityRepository } = await setup([museum]);
    const outcome = await create.execute({
      tripId: 'trip-1',
      input: activityInput({ title: 'museum', startTime: '09:00', endTime: '10:00' }),
    });
    expect(outcome).toEqual({
      status: 'invalid',
      errors: {
        fields: { title: 'duplicate' },
        duplicate: { id: 'museum', title: 'Museum', date: '2027-07-01', startTime: '09:00' },
      },
    });
    expect(await saved(activityRepository)).toHaveLength(1);
  });

  it('only looks for duplicates on the same day of the same trip', async () => {
    const { create } = await setup([museum]);
    const outcome = await create.execute({
      tripId: 'trip-1',
      input: activityInput({ title: 'Museum', date: '2027-07-02' }),
    });
    expect(outcome.status).toBe('saved');
  });

  it('saves an activity that overlaps another', async () => {
    const { create } = await setup([museum]);
    const outcome = await create.execute({
      tripId: 'trip-1',
      input: activityInput({ title: 'Lunch', startTime: '10:30', endTime: '12:00' }),
    });
    expect(outcome.status).toBe('saved');
  });

  it('reports a trip deleted meanwhile and saves nothing', async () => {
    const { create, tripRepository, activityRepository } = await setup();
    await tripRepository.delete(TRIP_OWNER, 'trip-1');

    const outcome = await create.execute({ tripId: 'trip-1', input: activityInput() });

    expect(outcome.status === 'failed' && outcome.error.kind).toBe('notFound');
    expect(await saved(activityRepository)).toEqual([]);
  });

  it('passes on a storage failure', async () => {
    const { create, activityRepository } = await setup();
    jest.spyOn(activityRepository, 'insert').mockResolvedValueOnce(storageFailure());
    const outcome = await create.execute({ tripId: 'trip-1', input: activityInput() });
    expect(outcome.status === 'failed' && outcome.error.kind).toBe('storage');
  });
});

describe('UpdateActivity', () => {
  const existing = activity({ id: 'museum', title: 'Museum', sortOrder: 0, createdAt: 1, updatedAt: 1 });

  it('saves the changes, keeps createdAt, completion and position, and moves updatedAt', async () => {
    const { update, activityRepository } = await setup([{ ...existing, isCompleted: true }, dinner]);
    const outcome = await update.execute({
      id: 'museum',
      input: activityInput({ title: 'Gulbenkian Museum', notes: 'Free on Sundays' }),
    });

    expect(outcome).toMatchObject({
      status: 'saved',
      activity: {
        id: 'museum',
        title: 'Gulbenkian Museum',
        notes: 'Free on Sundays',
        isCompleted: true,
        sortOrder: 0,
        createdAt: 1,
        updatedAt: TRIPS_NOW,
      },
    });
    expect((await saved(activityRepository))[0]?.title).toBe('Gulbenkian Museum');
  });

  it('keeps a dragged position when the start time does not change', async () => {
    const { update, activityRepository } = await setup([
      { ...dinner, sortOrder: 0 },
      { ...museum, sortOrder: 1 },
    ]);
    await update.execute({
      id: 'museum',
      input: activityInput({ title: 'Museum', startTime: '09:00', endTime: '11:30' }),
    });
    expect(await dayIds(activityRepository)).toEqual(['dinner', 'museum']);
  });

  it('re-places an activity whose start time changes', async () => {
    const { update, activityRepository } = await setup([museum, dinner]);
    await update.execute({
      id: 'museum',
      input: activityInput({ title: 'Museum', startTime: '20:00', endTime: '21:00' }),
    });
    expect(await dayIds(activityRepository)).toEqual(['dinner', 'museum']);
  });

  it('moves an activity to another day by its start time', async () => {
    const lateBreakfast = activity({
      id: 'brunch',
      title: 'Brunch',
      date: '2027-07-02',
      startTime: '11:00',
      sortOrder: 0,
    });
    const { update, activityRepository } = await setup([museum, dinner, lateBreakfast]);

    await update.execute({ id: 'museum', input: activityInput({ title: 'Museum', date: '2027-07-02' }) });

    expect(await dayIds(activityRepository)).toEqual(['dinner']);
    expect(await dayIds(activityRepository, '2027-07-02')).toEqual(['museum', 'brunch']);
  });

  it('does not count the activity as a duplicate of itself', async () => {
    const { update } = await setup([existing]);
    await expect(update.execute({ id: 'museum', input: activityInput({ title: 'Museum' }) })).resolves.toMatchObject({
      status: 'saved',
    });
  });

  it('requires an activity outside the trip dates to move to a trip day', async () => {
    const stray = activity({ id: 'stray', title: 'Stray', date: '2027-06-20' });
    const { update, activityRepository } = await setup([stray]);

    const kept = await update.execute({ id: 'stray', input: activityInput({ title: 'Renamed', date: '2027-06-20' }) });
    expect(kept).toEqual({ status: 'invalid', errors: { fields: { date: 'outsideTrip' } } });

    const moved = await update.execute({ id: 'stray', input: activityInput({ title: 'Renamed', date: '2027-07-03' }) });
    expect(moved).toMatchObject({ status: 'saved', activity: { date: '2027-07-03' } });
    expect((await saved(activityRepository))[0]?.title).toBe('Renamed');
  });

  it('reports an activity deleted meanwhile', async () => {
    const { update } = await setup();
    const outcome = await update.execute({ id: 'gone', input: activityInput() });
    expect(outcome.status === 'failed' && outcome.error.kind).toBe('notFound');
  });
});

describe('DeleteActivity', () => {
  it('deletes the activity', async () => {
    const { remove, activityRepository } = await setup([museum, dinner]);
    await expect(remove.execute('museum')).resolves.toEqual({ ok: true, value: undefined });
    expect(await dayIds(activityRepository)).toEqual(['dinner']);
  });

  it('reports a missing activity', async () => {
    const { remove } = await setup();
    const result = await remove.execute('nope');
    expect(!result.ok && result.error.kind).toBe('notFound');
  });
});

describe('SetActivityCompleted', () => {
  it('marks an activity done and returns it', async () => {
    const { setCompleted, activityRepository, clock } = await setup([museum]);
    clock.advance(1000);

    const result = await setCompleted.execute({ id: 'museum', completed: true });

    expect(result).toEqual({
      ok: true,
      value: { ...museum, isCompleted: true, updatedAt: TRIPS_NOW + 1000 },
    });
    expect((await saved(activityRepository))[0]?.isCompleted).toBe(true);
  });

  it('can be completed even when outside the trip dates', async () => {
    const { setCompleted } = await setup([activity({ id: 'stray', date: '2027-06-20' })]);
    await expect(setCompleted.execute({ id: 'stray', completed: true })).resolves.toMatchObject({
      ok: true,
      value: { isCompleted: true },
    });
  });

  it('reports a missing activity', async () => {
    const { setCompleted } = await setup();
    const result = await setCompleted.execute({ id: 'nope', completed: true });
    expect(!result.ok && result.error.kind).toBe('notFound');
  });
});

describe('ReorderActivities', () => {
  it("saves the day's new order and returns the day in it", async () => {
    const lunch = activity({ id: 'lunch', title: 'Lunch', startTime: '12:00', endTime: '13:00', sortOrder: 2 });
    const { reorder, activityRepository } = await setup([museum, dinner, lunch]);

    const result = await reorder.execute({
      tripId: 'trip-1',
      date: '2027-07-01',
      orderedIds: ['lunch', 'museum', 'dinner'],
    });

    expect(result.ok && result.value.map(({ id, sortOrder }) => [id, sortOrder])).toEqual([
      ['lunch', 0],
      ['museum', 1],
      ['dinner', 2],
    ]);
    expect(await dayIds(activityRepository)).toEqual(['lunch', 'museum', 'dinner']);
  });

  it('refuses an order that does not match the day and changes nothing', async () => {
    const { reorder, activityRepository } = await setup([museum, dinner]);
    const result = await reorder.execute({ tripId: 'trip-1', date: '2027-07-01', orderedIds: ['dinner'] });
    expect(!result.ok && result.error.kind).toBe('notFound');
    expect(await dayIds(activityRepository)).toEqual(['museum', 'dinner']);
  });

  it('passes on a storage failure', async () => {
    const { reorder, activityRepository } = await setup([museum, dinner]);
    jest.spyOn(activityRepository, 'reorder').mockResolvedValueOnce(storageFailure());
    const result = await reorder.execute({ tripId: 'trip-1', date: '2027-07-01', orderedIds: ['dinner', 'museum'] });
    expect(!result.ok && result.error.kind).toBe('storage');
  });
});

describe('activity ownership', () => {
  it("keeps each account to its own trips' activities", async () => {
    const { getItinerary, getActivity, owners } = await setup([museum]);
    owners.ownerId = OTHER_TRIP_OWNER;

    const itinerary = await getItinerary.execute('trip-1');
    const one = await getActivity.execute('museum');

    expect(!itinerary.ok && itinerary.error.kind).toBe('notFound');
    expect(!one.ok && one.error.kind).toBe('notFound');
  });

  it("can't add to, change or delete another account's itinerary", async () => {
    const { create, update, remove, setCompleted, reorder, owners, activityRepository } = await setup([museum]);
    owners.ownerId = OTHER_TRIP_OWNER;

    const notFound = { status: 'failed', error: { kind: 'notFound' } };
    expect(await create.execute({ tripId: 'trip-1', input: activityInput({ title: 'Mine now' }) })).toMatchObject(
      notFound,
    );
    expect(await update.execute({ id: 'museum', input: activityInput({ title: 'Taken' }) })).toMatchObject(notFound);
    for (const result of [
      await remove.execute('museum'),
      await setCompleted.execute({ id: 'museum', completed: true }),
      await reorder.execute({ tripId: 'trip-1', date: '2027-07-01', orderedIds: ['museum'] }),
    ]) {
      expect(!result.ok && result.error.kind).toBe('notFound');
    }
    expect(await saved(activityRepository)).toEqual([museum]);
  });

  it('refuses every operation when nobody is signed in', async () => {
    const { getItinerary, getActivity, create, update, remove, setCompleted, reorder, owners, activityRepository } =
      await setup([museum]);
    owners.ownerId = null;

    const failure = { status: 'failed', error: { kind: 'unauthorized' } };
    expect(await create.execute({ tripId: 'trip-1', input: activityInput({ title: 'New' }) })).toMatchObject(failure);
    expect(await update.execute({ id: 'museum', input: activityInput() })).toMatchObject(failure);
    for (const result of [
      await getItinerary.execute('trip-1'),
      await getActivity.execute('museum'),
      await remove.execute('museum'),
      await setCompleted.execute({ id: 'museum', completed: true }),
      await reorder.execute({ tripId: 'trip-1', date: '2027-07-01', orderedIds: ['museum'] }),
    ]) {
      expect(!result.ok && result.error.kind).toBe('unauthorized');
    }
    expect(await saved(activityRepository)).toEqual([museum]);
  });
});
