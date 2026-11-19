import { AppError } from '@/core/errors/AppError';
import { err } from '@/core/result';
import { ManualClock, sequentialIds } from '@/testing/ManualClock';
import {
  createTripStorage,
  FakeTripCoverStore,
  FakeTripOwnerProvider,
  OTHER_TRIP_OWNER,
  seededTripDatabase,
  storedTrip,
  tripInput,
  TRIP_OWNER,
  TRIPS_NOW,
} from '@/testing/tripFixtures';

import { type TripRepository } from '../repositories';
import { type StoredTrip } from '../Trip';
import { CreateTrip, DeleteTrip, GetTrip, GetTrips, SetTripCancelled, UpdateTrip } from './tripUseCases';

const storageFailure = () => err(new AppError('storage', 'disk full'));

async function setup(trips: readonly StoredTrip[] = []) {
  const { repository } = await seededTripDatabase(trips);
  const covers = new FakeTripCoverStore();
  const clock = new ManualClock(TRIPS_NOW);
  const owners = new FakeTripOwnerProvider();
  return {
    repository: repository as TripRepository,
    covers,
    clock,
    owners,
    getTrips: new GetTrips(repository, owners, clock),
    getTrip: new GetTrip(repository, owners, clock),
    create: new CreateTrip(repository, owners, covers, clock, sequentialIds('trip')),
    update: new UpdateTrip(repository, owners, covers, clock),
    remove: new DeleteTrip(repository, owners, covers),
    setCancelled: new SetTripCancelled(repository, owners, clock),
  };
}

async function allTrips(repository: TripRepository) {
  const trips = await repository.list(TRIP_OWNER);
  if (!trips.ok) throw trips.error;
  return trips.value;
}

describe('GetTrips / GetTrip', () => {
  it('derive each status from today', async () => {
    const { getTrips, getTrip } = await setup([
      storedTrip({ id: 'past', startDate: '2027-01-01', endDate: '2027-01-02' }),
      storedTrip({ id: 'now', startDate: '2027-06-10', endDate: '2027-06-20' }),
      storedTrip({ id: 'next', startDate: '2027-07-01', endDate: '2027-07-02' }),
      storedTrip({ id: 'off', startDate: '2027-08-01', endDate: '2027-08-02', cancelledAt: 5 }),
    ]);

    const trips = await getTrips.execute();
    expect(trips.ok && trips.value.map(({ id, status }) => [id, status])).toEqual([
      ['past', 'completed'],
      ['now', 'ongoing'],
      ['next', 'upcoming'],
      ['off', 'cancelled'],
    ]);
    const one = await getTrip.execute('now');
    expect(one.ok && one.value.status).toBe('ongoing');
  });

  it('report a missing trip', async () => {
    const { getTrip } = await setup();
    const result = await getTrip.execute('nope');
    expect(!result.ok && result.error.kind).toBe('notFound');
  });
});

describe('CreateTrip', () => {
  it('saves a valid trip with generated id and timestamps', async () => {
    const { create, repository } = await setup();
    const outcome = await create.execute(tripInput({ title: ' Lisbon ', budget: '99.50' }));

    expect(outcome).toEqual({
      status: 'saved',
      trip: expect.objectContaining({
        id: 'trip-1',
        title: 'Lisbon',
        budget: 9950,
        status: 'upcoming',
        cancelledAt: null,
        createdAt: TRIPS_NOW,
        updatedAt: TRIPS_NOW,
      }),
    });
    expect(await allTrips(repository)).toHaveLength(1);
  });

  it('saves nothing and copies no photo when the input is invalid', async () => {
    const { create, repository, covers } = await setup();
    const outcome = await create.execute(tripInput({ title: '', coverImage: 'file:///picked.jpg' }));

    expect(outcome).toEqual({ status: 'invalid', errors: { fields: { title: 'required' } } });
    expect(await allTrips(repository)).toHaveLength(0);
    expect(covers.stored.size).toBe(0);
  });

  it('refuses overlapping dates and names the conflicting trip', async () => {
    const existing = storedTrip({ id: 'rome', title: 'Rome', startDate: '2027-07-03', endDate: '2027-07-08' });
    const { create, covers } = await setup([existing]);
    const outcome = await create.execute(tripInput({ coverImage: 'file:///picked.jpg' }));

    expect(outcome).toEqual({
      status: 'invalid',
      errors: {
        fields: { dates: 'overlap' },
        conflict: { id: 'rome', title: 'Rome', startDate: '2027-07-03', endDate: '2027-07-08' },
      },
    });
    expect(covers.stored.size).toBe(0);
  });

  it('allows a trip starting the day another ends, and dates held only by a cancelled trip', async () => {
    const { create } = await setup([
      storedTrip({ id: 'before', startDate: '2027-06-25', endDate: '2027-07-01' }),
      storedTrip({ id: 'off', startDate: '2027-07-02', endDate: '2027-07-03', cancelledAt: 1 }),
    ]);
    await expect(create.execute(tripInput())).resolves.toMatchObject({ status: 'saved' });
  });

  it('copies a picked cover and stores its reference', async () => {
    const { create } = await setup();
    const outcome = await create.execute(tripInput({ coverImage: 'file:///picked.jpg' }));
    expect(outcome).toMatchObject({ status: 'saved', trip: { coverImage: 'trip-covers/cover-1.jpg' } });
  });

  it('fails without saving when the photo cannot be copied', async () => {
    const { create, covers, repository } = await setup();
    covers.failImports = true;
    const outcome = await create.execute(tripInput({ coverImage: 'file:///picked.jpg' }));
    expect(outcome.status === 'failed' && outcome.error.kind).toBe('storage');
    expect(await allTrips(repository)).toHaveLength(0);
  });

  it('removes the copied photo when the insert fails', async () => {
    const { create, covers, repository } = await setup();
    jest.spyOn(repository, 'insert').mockResolvedValueOnce(storageFailure());
    const outcome = await create.execute(tripInput({ coverImage: 'file:///picked.jpg' }));
    expect(outcome.status).toBe('failed');
    expect(covers.removed).toEqual(['trip-covers/cover-1.jpg']);
  });

  it('passes on a failed overlap check without saving', async () => {
    const { create, repository } = await setup();
    jest.spyOn(repository, 'findOverlapping').mockResolvedValueOnce(storageFailure());
    await expect(create.execute(tripInput())).resolves.toMatchObject({ status: 'failed' });
    expect(await allTrips(repository)).toHaveLength(0);
  });
});

describe('UpdateTrip', () => {
  const existing = storedTrip({ id: 'lisbon', coverImage: 'trip-covers/old.jpg', createdAt: 1, updatedAt: 1 });

  it('saves the changes, keeps createdAt and moves updatedAt', async () => {
    const { update, repository } = await setup([existing]);
    const outcome = await update.execute({
      id: 'lisbon',
      input: tripInput({ title: 'Porto', coverImage: 'trip-covers/old.jpg' }),
    });
    expect(outcome).toMatchObject({ status: 'saved', trip: { title: 'Porto', createdAt: 1, updatedAt: TRIPS_NOW } });
    expect((await allTrips(repository))[0]?.title).toBe('Porto');
  });

  it('does not count the trip as overlapping itself', async () => {
    const { update } = await setup([existing]);
    await expect(update.execute({ id: 'lisbon', input: tripInput({ endDate: '2027-07-06' }) })).resolves.toMatchObject({
      status: 'saved',
    });
  });

  it('refuses dates that overlap another trip', async () => {
    const other = storedTrip({ id: 'rome', title: 'Rome', startDate: '2027-07-10', endDate: '2027-07-12' });
    const { update, repository } = await setup([existing, other]);
    const outcome = await update.execute({ id: 'lisbon', input: tripInput({ endDate: '2027-07-11' }) });
    expect(outcome).toMatchObject({ status: 'invalid', errors: { conflict: { id: 'rome' } } });
    expect((await allTrips(repository))[0]?.endDate).toBe('2027-07-05');
  });

  it('lets a cancelled trip take any dates, and it stays cancelled', async () => {
    const other = storedTrip({ id: 'rome', startDate: '2027-07-02', endDate: '2027-07-03' });
    const { update } = await setup([{ ...existing, cancelledAt: 9 }, other]);
    await expect(update.execute({ id: 'lisbon', input: tripInput() })).resolves.toMatchObject({
      status: 'saved',
      trip: { status: 'cancelled', cancelledAt: 9 },
    });
  });

  it('keeps an unchanged cover without touching files', async () => {
    const { update, covers } = await setup([existing]);
    await update.execute({ id: 'lisbon', input: tripInput({ coverImage: 'trip-covers/old.jpg' }) });
    expect(covers.removed).toEqual([]);
    expect(covers.stored.size).toBe(0);
  });

  it('replaces a cover and deletes the old file after saving', async () => {
    const { update, covers } = await setup([existing]);
    const outcome = await update.execute({ id: 'lisbon', input: tripInput({ coverImage: 'file:///new.jpg' }) });
    expect(outcome).toMatchObject({ trip: { coverImage: 'trip-covers/cover-1.jpg' } });
    expect(covers.removed).toEqual(['trip-covers/old.jpg']);
  });

  it('removes a cleared cover', async () => {
    const { update, covers } = await setup([existing]);
    const outcome = await update.execute({ id: 'lisbon', input: tripInput({ coverImage: null }) });
    expect(outcome).toMatchObject({ trip: { coverImage: null } });
    expect(covers.removed).toEqual(['trip-covers/old.jpg']);
  });

  it('keeps the old cover and drops the new copy when the update fails', async () => {
    const { update, covers, repository } = await setup([existing]);
    jest.spyOn(repository, 'update').mockResolvedValueOnce(storageFailure());
    await update.execute({ id: 'lisbon', input: tripInput({ coverImage: 'file:///new.jpg' }) });
    expect(covers.removed).toEqual(['trip-covers/cover-1.jpg']);
  });

  it('reports a trip deleted meanwhile', async () => {
    const { update } = await setup();
    const outcome = await update.execute({ id: 'gone', input: tripInput() });
    expect(outcome.status === 'failed' && outcome.error.kind).toBe('notFound');
  });
});

describe('DeleteTrip', () => {
  it('deletes the trip and then its cover', async () => {
    const { remove, repository, covers } = await setup([storedTrip({ coverImage: 'trip-covers/a.jpg' })]);
    await expect(remove.execute('trip-1')).resolves.toEqual({ ok: true, value: undefined });
    expect(await allTrips(repository)).toHaveLength(0);
    expect(covers.removed).toEqual(['trip-covers/a.jpg']);
  });

  it('keeps the cover when the delete fails', async () => {
    const { remove, repository, covers } = await setup([storedTrip({ coverImage: 'trip-covers/a.jpg' })]);
    jest.spyOn(repository, 'delete').mockResolvedValueOnce(storageFailure());
    await expect(remove.execute('trip-1')).resolves.toMatchObject({ ok: false });
    expect(covers.removed).toEqual([]);
  });

  it('reports a missing trip', async () => {
    const { remove } = await setup();
    const result = await remove.execute('nope');
    expect(!result.ok && result.error.kind).toBe('notFound');
  });
});

describe('SetTripCancelled', () => {
  it('cancels a trip, freeing its dates', async () => {
    const { setCancelled, create } = await setup([storedTrip({ id: 'first' })]);
    await expect(setCancelled.execute({ id: 'first', cancelled: true })).resolves.toMatchObject({
      trip: { status: 'cancelled', cancelledAt: TRIPS_NOW, updatedAt: TRIPS_NOW },
    });
    await expect(create.execute(tripInput())).resolves.toMatchObject({ status: 'saved' });
  });

  it('restores a trip to its date-based status', async () => {
    const { setCancelled } = await setup([storedTrip({ cancelledAt: 5 })]);
    await expect(setCancelled.execute({ id: 'trip-1', cancelled: false })).resolves.toMatchObject({
      trip: { status: 'upcoming', cancelledAt: null },
    });
  });

  it('refuses to restore a trip whose dates were taken', async () => {
    const { setCancelled, repository } = await setup([
      storedTrip({ id: 'off', cancelledAt: 5 }),
      storedTrip({ id: 'taken', title: 'Rome', startDate: '2027-07-02', endDate: '2027-07-04' }),
    ]);
    await expect(setCancelled.execute({ id: 'off', cancelled: false })).resolves.toMatchObject({
      status: 'invalid',
      errors: { fields: { dates: 'overlap' }, conflict: { title: 'Rome' } },
    });
    expect((await allTrips(repository))[0]?.cancelledAt).toBe(5);
  });

  it('changes nothing when already in that state', async () => {
    const { setCancelled, repository, clock } = await setup([storedTrip({ cancelledAt: 5 })]);
    clock.advance(1000);
    const spy = jest.spyOn(repository, 'update');
    await expect(setCancelled.execute({ id: 'trip-1', cancelled: true })).resolves.toMatchObject({
      trip: { cancelledAt: 5 },
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('reports a missing trip', async () => {
    const { repository } = createTripStorage();
    const setCancelled = new SetTripCancelled(repository, new FakeTripOwnerProvider(), new ManualClock(TRIPS_NOW));
    const outcome = await setCancelled.execute({ id: 'nope', cancelled: true });
    expect(outcome.status === 'failed' && outcome.error.kind).toBe('notFound');
  });
});

describe('trip ownership', () => {
  it('keeps each account to its own trips', async () => {
    const { getTrips, getTrip, owners } = await setup([storedTrip({ id: 'mine' })]);

    owners.ownerId = OTHER_TRIP_OWNER;

    const trips = await getTrips.execute();
    const trip = await getTrip.execute('mine');
    expect(trips.ok && trips.value).toEqual([]);
    expect(!trip.ok && trip.error.kind).toBe('notFound');
  });

  it("can't change or delete another account's trip", async () => {
    const { update, remove, setCancelled, repository, owners, covers } = await setup([
      storedTrip({ id: 'mine', coverImage: 'trip-covers/mine.jpg' }),
    ]);

    owners.ownerId = OTHER_TRIP_OWNER;

    const updated = await update.execute({ id: 'mine', input: tripInput({ title: 'Taken' }) });
    const cancelled = await setCancelled.execute({ id: 'mine', cancelled: true });
    const removed = await remove.execute('mine');

    expect(updated).toMatchObject({ status: 'failed', error: { kind: 'notFound' } });
    expect(cancelled).toMatchObject({ status: 'failed', error: { kind: 'notFound' } });
    expect(!removed.ok && removed.error.kind).toBe('notFound');
    expect(covers.removed).toEqual([]);
    expect(await allTrips(repository)).toEqual([storedTrip({ id: 'mine', coverImage: 'trip-covers/mine.jpg' })]);
  });

  it("doesn't treat another account's dates as taken", async () => {
    const { create, owners, repository } = await setup([storedTrip({ id: 'mine' })]);

    owners.ownerId = OTHER_TRIP_OWNER;
    const outcome = await create.execute(tripInput());

    expect(outcome.status).toBe('saved');
    const theirs = await repository.list(OTHER_TRIP_OWNER);
    expect(theirs.ok && theirs.value).toHaveLength(1);
  });

  it('refuses every operation when nobody is signed in', async () => {
    const { getTrips, getTrip, create, update, remove, setCancelled, owners, repository } = await setup([
      storedTrip({ id: 'mine' }),
    ]);

    owners.ownerId = null;

    const reads = [await getTrips.execute(), await getTrip.execute('mine'), await remove.execute('mine')];
    for (const result of reads) expect(!result.ok && result.error.kind).toBe('unauthorized');
    const failure = { status: 'failed', error: { kind: 'unauthorized' } };
    expect(await create.execute(tripInput())).toMatchObject(failure);
    expect(await update.execute({ id: 'mine', input: tripInput() })).toMatchObject(failure);
    expect(await setCancelled.execute({ id: 'mine', cancelled: true })).toMatchObject(failure);
    expect(await allTrips(repository)).toHaveLength(1);
  });
});
