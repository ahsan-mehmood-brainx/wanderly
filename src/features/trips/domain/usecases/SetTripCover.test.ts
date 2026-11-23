import { AppError } from '@/core/errors/AppError';
import { err } from '@/core/result';
import { ManualClock } from '@/testing/ManualClock';
import {
  FakeTripCoverStore,
  FakeTripOwnerProvider,
  OTHER_TRIP_OWNER,
  seededTripDatabase,
  storedTrip,
  TRIP_OWNER,
  TRIPS_NOW,
} from '@/testing/tripFixtures';

import { type TripRepository } from '../repositories';
import { type StoredTrip } from '../Trip';
import { SetTripCover } from './tripUseCases';

const PHOTO_URI = 'file:///documents/trip-photos/stored-1.jpg';

async function setup(trips: readonly StoredTrip[]) {
  const { repository } = await seededTripDatabase(trips);
  const covers = new FakeTripCoverStore();
  const owners = new FakeTripOwnerProvider();
  const clock = new ManualClock(TRIPS_NOW + 1000);
  return {
    repository: repository as TripRepository,
    covers,
    owners,
    setCover: new SetTripCover(repository, owners, covers, clock),
  };
}

async function storedCover(repository: TripRepository, id = 'trip-1') {
  const found = await repository.findById(TRIP_OWNER, id);
  if (!found.ok) throw found.error;
  return found.value?.coverImage;
}

describe('SetTripCover', () => {
  it('copies the photo in as the cover, saves the trip and removes the old cover after', async () => {
    const { setCover, repository, covers } = await setup([storedTrip({ coverImage: 'trip-covers/old.jpg' })]);

    const outcome = await setCover.execute({ id: 'trip-1', sourceUri: PHOTO_URI });

    expect(outcome).toMatchObject({
      status: 'saved',
      trip: { id: 'trip-1', coverImage: 'trip-covers/cover-1.jpg', updatedAt: TRIPS_NOW + 1000 },
    });
    expect(await storedCover(repository)).toBe('trip-covers/cover-1.jpg');
    expect(covers.removed).toEqual(['trip-covers/old.jpg']);
  });

  it('copies the image instead of referencing the gallery file, so deleting the photo keeps the cover', async () => {
    const { setCover, covers } = await setup([storedTrip()]);

    await setCover.execute({ id: 'trip-1', sourceUri: PHOTO_URI });

    expect([...covers.stored]).toEqual(['trip-covers/cover-1.jpg']);
  });

  it('changes nothing but the cover, even for a trip whose dates overlap another', async () => {
    const trip = storedTrip({ title: 'Lisbon', description: 'Old town', budget: 90_000 });
    const overlapping = storedTrip({ id: 'trip-2', startDate: '2027-07-03', endDate: '2027-07-09' });
    const { setCover, repository } = await setup([trip, overlapping]);

    const outcome = await setCover.execute({ id: 'trip-1', sourceUri: PHOTO_URI });

    expect(outcome.status).toBe('saved');
    const found = await repository.findById(TRIP_OWNER, 'trip-1');
    expect(found.ok && found.value).toEqual({
      ...trip,
      coverImage: 'trip-covers/cover-1.jpg',
      updatedAt: TRIPS_NOW + 1000,
    });
  });

  it('clears the cover with a null source', async () => {
    const { setCover, repository, covers } = await setup([storedTrip({ coverImage: 'trip-covers/old.jpg' })]);

    await expect(setCover.execute({ id: 'trip-1', sourceUri: null })).resolves.toMatchObject({
      status: 'saved',
      trip: { coverImage: null },
    });
    expect(await storedCover(repository)).toBeNull();
    expect(covers.removed).toEqual(['trip-covers/old.jpg']);
  });

  it('fails without saving when the photo cannot be copied', async () => {
    const { setCover, repository, covers } = await setup([storedTrip({ coverImage: 'trip-covers/old.jpg' })]);
    covers.failImports = true;

    const outcome = await setCover.execute({ id: 'trip-1', sourceUri: PHOTO_URI });

    expect(outcome.status === 'failed' && outcome.error.kind).toBe('storage');
    expect(await storedCover(repository)).toBe('trip-covers/old.jpg');
    expect(covers.removed).toEqual([]);
  });

  it('keeps the old cover and drops the new copy when the update fails', async () => {
    const { setCover, repository, covers } = await setup([storedTrip({ coverImage: 'trip-covers/old.jpg' })]);
    jest.spyOn(repository, 'update').mockResolvedValueOnce(err(new AppError('storage', 'disk full')));

    const outcome = await setCover.execute({ id: 'trip-1', sourceUri: PHOTO_URI });

    expect(outcome.status === 'failed' && outcome.error.kind).toBe('storage');
    expect(covers.removed).toEqual(['trip-covers/cover-1.jpg']);
    expect(await storedCover(repository)).toBe('trip-covers/old.jpg');
  });

  it("is notFound for a missing trip or another account's trip, copying nothing", async () => {
    const { setCover, owners, covers } = await setup([storedTrip()]);

    const missing = await setCover.execute({ id: 'gone', sourceUri: PHOTO_URI });
    owners.ownerId = OTHER_TRIP_OWNER;
    const theirs = await setCover.execute({ id: 'trip-1', sourceUri: PHOTO_URI });

    expect(missing).toMatchObject({ status: 'failed', error: { kind: 'notFound' } });
    expect(theirs).toMatchObject({ status: 'failed', error: { kind: 'notFound' } });
    expect(covers.stored.size).toBe(0);
  });

  it('refuses when nobody is signed in', async () => {
    const { setCover, owners, covers } = await setup([storedTrip()]);
    owners.ownerId = null;

    await expect(setCover.execute({ id: 'trip-1', sourceUri: PHOTO_URI })).resolves.toMatchObject({
      status: 'failed',
      error: { kind: 'unauthorized' },
    });
    expect(covers.stored.size).toBe(0);
  });
});
