import { activity, activityInput, ITINERARY_TRIP, seededItineraryDatabase } from '@/testing/itineraryFixtures';
import { ManualClock, sequentialIds } from '@/testing/ManualClock';
import { FakeTripOwnerProvider, OTHER_TRIP_OWNER, storedTrip, TRIP_OWNER, TRIPS_NOW } from '@/testing/tripFixtures';

import { type Activity, ACTIVITY_LIMITS } from '../Activity';
import { CreateActivity, GetItinerary, ReorderActivities, UpdateActivity } from './activityUseCases';

const DAY = '2027-07-01';
const DAY_2 = '2027-07-02';

async function setup(activities: readonly Activity[] = [], trips = [ITINERARY_TRIP]) {
  const storage = await seededItineraryDatabase(trips, activities);
  const clock = new ManualClock(TRIPS_NOW);
  const owners = new FakeTripOwnerProvider();
  const { activityRepository, tripRepository } = storage;
  return {
    ...storage,
    owners,
    getItinerary: new GetItinerary(activityRepository, tripRepository, owners),
    create: new CreateActivity(activityRepository, tripRepository, owners, clock, sequentialIds('new')),
    update: new UpdateActivity(activityRepository, tripRepository, owners, clock),
    reorder: new ReorderActivities(activityRepository, owners, clock),
  };
}

async function dayIds(storage: Awaited<ReturnType<typeof setup>>, date = DAY) {
  const result = await storage.activityRepository.listByTrip(TRIP_OWNER, 'trip-1');
  if (!result.ok) throw result.error;
  return result.value.filter((item) => item.date === date).map(({ id }) => id);
}

const inputOf = (item: Activity, overrides: Parameters<typeof activityInput>[0] = {}) =>
  activityInput({
    title: item.title,
    category: item.category,
    date: item.date,
    startTime: item.startTime,
    endTime: item.endTime,
    ...overrides,
  });

const museum = activity({ id: 'museum', title: 'Museum', startTime: '09:00', endTime: '11:00', sortOrder: 0 });
const free = activity({ id: 'free', title: 'Free time', startTime: null, endTime: null, sortOrder: 1 });
const dinner = activity({ id: 'dinner', title: 'Dinner', startTime: '19:00', endTime: '21:00', sortOrder: 2 });

describe('activity use cases edge cases', () => {
  it('adds an untimed activity at the end of the day', async () => {
    const storage = await setup([museum, free, dinner]);
    const outcome = await storage.create.execute({
      tripId: 'trip-1',
      input: activityInput({ title: 'Souvenirs', startTime: null, endTime: null }),
    });
    expect(outcome.status === 'saved' && outcome.activity.sortOrder).toBe(3);
    await expect(dayIds(storage)).resolves.toEqual(['museum', 'free', 'dinner', 'new-1']);
  });

  it('refuses an add without a day and saves nothing', async () => {
    const storage = await setup([museum]);
    const outcome = await storage.create.execute({ tripId: 'trip-1', input: activityInput({ date: null }) });
    expect(outcome.status === 'invalid' && outcome.errors.fields.date).toBe('required');
    await expect(dayIds(storage)).resolves.toEqual(['museum']);
  });

  it('keeps a dragged position when only the end time, title or cost changes', async () => {
    const storage = await setup([dinner, museum].map((item, sortOrder) => ({ ...item, sortOrder })));
    const outcome = await storage.update.execute({
      id: 'museum',
      input: inputOf(museum, { title: 'Art museum', endTime: '12:00', estimatedCost: '15' }),
    });
    expect(outcome.status === 'saved' && outcome.activity.sortOrder).toBe(1);
    await expect(dayIds(storage)).resolves.toEqual(['dinner', 'museum']);
  });

  it('moves an activity to the end of its day when its start time is cleared', async () => {
    const storage = await setup([museum, dinner].map((item, sortOrder) => ({ ...item, sortOrder })));
    const outcome = await storage.update.execute({
      id: 'museum',
      input: inputOf(museum, { startTime: null, endTime: null }),
    });
    expect(outcome.status).toBe('saved');
    await expect(dayIds(storage)).resolves.toEqual(['dinner', 'museum']);
  });

  it('refuses to move an activity onto a full day and leaves both days unchanged', async () => {
    const full = Array.from({ length: ACTIVITY_LIMITS.maxActivitiesPerDay }, (_, index) =>
      activity({
        id: `full-${index}`,
        title: `Stop ${index}`,
        date: DAY_2,
        startTime: null,
        endTime: null,
        sortOrder: index,
      }),
    );
    const storage = await setup([museum, ...full]);
    const outcome = await storage.update.execute({ id: 'museum', input: inputOf(museum, { date: DAY_2 }) });
    expect(outcome.status === 'invalid' && outcome.errors.fields.date).toBe('dayFull');
    await expect(dayIds(storage)).resolves.toEqual(['museum']);
    expect(await dayIds(storage, DAY_2)).toHaveLength(ACTIVITY_LIMITS.maxActivitiesPerDay);
  });

  it('refuses an edit that would duplicate another activity on the day it moves to', async () => {
    const twin = activity({ id: 'twin', title: 'Museum', date: DAY_2, startTime: '09:00', sortOrder: 0 });
    const storage = await setup([museum, twin]);
    const outcome = await storage.update.execute({ id: 'museum', input: inputOf(museum, { date: DAY_2 }) });
    expect(outcome.status === 'invalid' && outcome.errors.duplicate?.id).toBe('twin');
  });

  it('refuses an add on a day the trip lost after its dates were shortened', async () => {
    const shortened = storedTrip({ id: 'trip-1', startDate: DAY, endDate: DAY });
    const storage = await setup([], [shortened]);
    const outcome = await storage.create.execute({ tripId: 'trip-1', input: activityInput({ date: DAY_2 }) });
    expect(outcome.status === 'invalid' && outcome.errors.fields.date).toBe('outsideTrip');
  });

  it("reports another account's trip as not found", async () => {
    const storage = await setup([museum]);
    storage.owners.ownerId = OTHER_TRIP_OWNER;
    const result = await storage.getItinerary.execute('trip-1');
    expect(!result.ok && result.error.kind).toBe('notFound');
  });

  it('saves the order of a one-activity day', async () => {
    const storage = await setup([museum]);
    const result = await storage.reorder.execute({ tripId: 'trip-1', date: DAY, orderedIds: ['museum'] });
    expect(result.ok && result.value.map(({ id }) => id)).toEqual(['museum']);
  });

  it('refuses to reorder a day of a trip that no longer exists', async () => {
    const storage = await setup([museum]);
    await storage.tripRepository.delete(TRIP_OWNER, 'trip-1');
    const result = await storage.reorder.execute({ tripId: 'trip-1', date: DAY, orderedIds: ['museum'] });
    expect(!result.ok && result.error.kind).toBe('notFound');
  });
});
