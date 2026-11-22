import { type AppDependencies } from '@/core/di/AppDependencies';
import { AppError } from '@/core/errors/AppError';
import { err } from '@/core/result';
import { type AuthUser } from '@/features/auth/domain/AuthUser';
import { sessionExpired, signIn, signOut } from '@/features/auth/presentation/state/authSlice';
import { deleteActivity } from '@/features/itinerary/presentation/state/itinerarySlice';
import { deleteTrip, loadTrips } from '@/features/trips/presentation/state/tripsSlice';
import { createTestStore } from '@/testing/createTestStore';
import { ManualClock } from '@/testing/ManualClock';
import {
  FakePhotoFileStore,
  photo,
  PHOTO_ACTIVITY,
  PHOTOS_NOW,
  PHOTOS_TRIP,
  pickedImage,
  seededPhotoDatabase,
} from '@/testing/photoFixtures';
import { createTestDependencies } from '@/testing/testDependencies';
import { FakeTripOwnerProvider, storedTrip, TRIP_OWNER } from '@/testing/tripFixtures';

import { type Photo } from '../../domain/Photo';
import {
  attachPhotos,
  clearPendingPhotos,
  deletePhoto,
  loadTripPhotos,
  prunePhotoFiles,
  removePendingImage,
  setPendingPhotos,
} from './photosSlice';
import {
  selectActivityPhotos,
  selectPendingPhotos,
  selectPhotoById,
  selectPhotosLoadStatus,
  selectPhotosSaving,
  selectTripPhotos,
} from './selectors';

const trip2 = storedTrip({ id: 'trip-2', startDate: '2027-09-01', endDate: '2027-09-03' });
const beach = photo({ id: 'beach', reference: 'trip-photos/beach.jpg', createdAt: 1 });
const tower = photo({ id: 'tower', reference: 'trip-photos/tower.jpg', activityId: 'act-1', createdAt: 2 });
const elsewhere = photo({ id: 'elsewhere', tripId: 'trip-2', reference: 'trip-photos/else.jpg', createdAt: 3 });

const PHOTO_KEYS = [
  'activityId',
  'createdAt',
  'fileSize',
  'height',
  'id',
  'mimeType',
  'reference',
  'source',
  'takenAt',
  'tripId',
  'width',
];

async function setup(photos: readonly Photo[] = [beach, tower, elsewhere], overrides: Partial<AppDependencies> = {}) {
  const storage = await seededPhotoDatabase([PHOTOS_TRIP, trip2], [PHOTO_ACTIVITY], photos);
  const owners = new FakeTripOwnerProvider();
  const dependencies = createTestDependencies({
    database: storage.database,
    tripOwnerProvider: owners,
    clock: new ManualClock(PHOTOS_NOW),
    ...overrides,
  });
  const store = createTestStore(dependencies);
  await store.dispatch(loadTrips());
  return { ...storage, dependencies, owners, store };
}

type Store = Awaited<ReturnType<typeof setup>>['store'];

const photoIds = (store: Store, tripId = 'trip-1') => selectTripPhotos(store.getState(), tripId).map(({ id }) => id);

async function savedPhotos(storage: Awaited<ReturnType<typeof setup>>, tripId = 'trip-1') {
  const result = await storage.photoRepository.listByTrip(TRIP_OWNER, tripId);
  if (!result.ok) throw result.error;
  return result.value;
}

const user: AuthUser = { id: 2, username: 'b', email: 'b@example.com', firstName: 'B', lastName: 'C', imageUrl: null };
const credentials = { username: 'b', password: 'secret' };

describe('photos state', () => {
  it("loads a trip's photos once, newest first, with its activities' photos", async () => {
    const { store, dependencies } = await setup();
    const getTripPhotos = jest.spyOn(dependencies.getTripPhotos, 'execute');

    await store.dispatch(loadTripPhotos('trip-1'));
    await store.dispatch(loadTripPhotos('trip-1'));

    expect(selectPhotosLoadStatus(store.getState(), 'trip-1')).toBe('ready');
    expect(photoIds(store)).toEqual(['tower', 'beach']);
    expect(selectActivityPhotos(store.getState(), 'act-1').map(({ id }) => id)).toEqual(['tower']);
    expect(selectPhotoById(store.getState(), 'beach')).toEqual(beach);
    expect(selectPhotosLoadStatus(store.getState(), 'trip-2')).toBe('idle');
    expect(getTripPhotos).toHaveBeenCalledTimes(1);
  });

  it('records a failed load and can retry', async () => {
    const { store, dependencies } = await setup();
    jest.spyOn(dependencies.getTripPhotos, 'execute').mockResolvedValueOnce(err(new AppError('storage', 'locked')));

    await store.dispatch(loadTripPhotos('trip-1'));
    expect(selectPhotosLoadStatus(store.getState(), 'trip-1')).toBe('failed');
    expect(store.getState().photos.loadByTrip['trip-1']).toMatchObject({ errorKind: 'storage' });

    await store.dispatch(loadTripPhotos('trip-1'));
    expect(selectPhotosLoadStatus(store.getState(), 'trip-1')).toBe('ready');
  });

  it('mirrors attached photos after they are saved, keeping only serialisable metadata', async () => {
    const storage = await setup([beach]);
    const { store } = storage;
    await store.dispatch(loadTripPhotos('trip-1'));

    const action = await store.dispatch(
      attachPhotos({
        tripId: 'trip-1',
        activityId: null,
        images: [pickedImage({ uri: 'file:///cache/a.jpg' }), pickedImage({ uri: 'file:///cache/b.jpg' })],
      }),
    );

    expect(action.payload).toMatchObject({ status: 'saved', rejected: [] });
    expect(selectTripPhotos(store.getState(), 'trip-1')).toHaveLength(3);
    expect(await savedPhotos(storage)).toHaveLength(3);
    const state = store.getState().photos;
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    for (const item of selectTripPhotos(store.getState(), 'trip-1')) {
      expect(Object.keys(item).sort()).toEqual(PHOTO_KEYS);
      expect(item.reference).toMatch(/^trip-photos\/[\w-]+\.jpg$/);
    }
    expect(JSON.stringify(state)).not.toMatch(/data:image|base64|[A-Za-z0-9+/]{200,}/);
  });

  it('adds nothing and names the rejected images when none is valid', async () => {
    const { store } = await setup([beach]);
    await store.dispatch(loadTripPhotos('trip-1'));

    const action = await store.dispatch(
      attachPhotos({
        tripId: 'trip-1',
        activityId: null,
        images: [pickedImage({ mimeType: 'image/gif', fileName: 'a.gif', uri: 'file:///a.gif' })],
      }),
    );

    expect(action.payload).toEqual({ status: 'invalid', rejected: [{ index: 0, reason: 'unsupportedType' }] });
    expect(photoIds(store)).toEqual(['beach']);
    expect(selectPhotosSaving(store.getState())).toBe(false);
  });

  it('turns a failed attach into its kind and adds nothing', async () => {
    const files = new FakePhotoFileStore();
    files.failImports = true;
    const { store } = await setup([beach], { photoFileStore: files });
    await store.dispatch(loadTripPhotos('trip-1'));

    const action = await store.dispatch(attachPhotos({ tripId: 'trip-1', activityId: null, images: [pickedImage()] }));

    expect(action.payload).toEqual({ status: 'failed', errorKind: 'storage' });
    expect(photoIds(store)).toEqual(['beach']);
  });

  it('runs one change at a time, so a double tap on Attach saves once', async () => {
    const storage = await setup([]);
    const { store } = storage;
    const input = { tripId: 'trip-1', activityId: null, images: [pickedImage()] };

    const first = store.dispatch(attachPhotos(input));
    expect(selectPhotosSaving(store.getState())).toBe(true);
    const second = store.dispatch(attachPhotos(input));
    const [firstAction, secondAction] = await Promise.all([first, second]);

    expect(attachPhotos.fulfilled.match(firstAction)).toBe(true);
    expect(attachPhotos.rejected.match(secondAction) && secondAction.meta.condition).toBe(true);
    expect(await savedPhotos(storage)).toHaveLength(1);
    expect(selectPhotosSaving(store.getState())).toBe(false);
  });

  it('releases the save lock after an unexpected throw', async () => {
    const { store, dependencies } = await setup([]);
    jest.spyOn(dependencies.attachPhotos, 'execute').mockRejectedValueOnce(new Error('bug'));

    await store.dispatch(attachPhotos({ tripId: 'trip-1', activityId: null, images: [pickedImage()] }));

    expect(selectPhotosSaving(store.getState())).toBe(false);
  });

  it('removes a deleted photo, and keeps it when the delete fails', async () => {
    const storage = await setup();
    const { store, dependencies } = storage;
    await store.dispatch(loadTripPhotos('trip-1'));

    jest.spyOn(dependencies.photoRepository, 'delete').mockResolvedValueOnce(err(new AppError('storage', 'x')));
    const failed = await store.dispatch(deletePhoto('beach'));
    expect(failed.payload).toEqual({ status: 'failed', errorKind: 'storage' });
    expect(selectPhotoById(store.getState(), 'beach')).toBeDefined();

    const deleted = await store.dispatch(deletePhoto('beach'));
    expect(deleted.payload).toEqual({ status: 'deleted', id: 'beach' });
    expect(selectPhotoById(store.getState(), 'beach')).toBeUndefined();
    expect(photoIds(store)).toEqual(['tower']);
    expect((await savedPhotos(storage)).map(({ id }) => id)).toEqual(['tower']);
  });

  it("drops a deleted trip's photos and keeps other trips'", async () => {
    const { store } = await setup();
    await store.dispatch(loadTripPhotos('trip-1'));
    await store.dispatch(loadTripPhotos('trip-2'));

    await store.dispatch(deleteTrip('trip-1'));

    expect(selectTripPhotos(store.getState(), 'trip-1')).toEqual([]);
    expect(selectPhotosLoadStatus(store.getState(), 'trip-1')).toBe('idle');
    expect(photoIds(store, 'trip-2')).toEqual(['elsewhere']);
  });

  it("drops a deleted activity's photos and keeps the trip's own", async () => {
    const { store } = await setup();
    await store.dispatch(loadTripPhotos('trip-1'));

    const action = await store.dispatch(deleteActivity('act-1'));

    expect(action.payload).toEqual({ status: 'deleted', id: 'act-1' });
    expect(selectActivityPhotos(store.getState(), 'act-1')).toEqual([]);
    expect(photoIds(store)).toEqual(['beach']);
  });

  it('holds pending images as temporary URIs until attached or discarded', async () => {
    const { store } = await setup([]);
    const images = [pickedImage({ uri: 'file:///cache/a.jpg' }), pickedImage({ uri: 'file:///cache/b.jpg' })];

    store.dispatch(setPendingPhotos({ tripId: 'trip-1', activityId: 'act-1', images }));
    expect(selectPendingPhotos(store.getState())).toEqual({ tripId: 'trip-1', activityId: 'act-1', images });

    store.dispatch(removePendingImage(0));
    expect(selectPendingPhotos(store.getState())?.images.map(({ uri }) => uri)).toEqual(['file:///cache/b.jpg']);

    store.dispatch(clearPendingPhotos());
    expect(selectPendingPhotos(store.getState())).toBeNull();
  });

  it('prunes orphaned files once per session', async () => {
    const { store, dependencies } = await setup([]);
    const prune = jest.spyOn(dependencies.prunePhotoFiles, 'execute');

    await store.dispatch(prunePhotoFiles());
    await store.dispatch(prunePhotoFiles());

    expect(prune).toHaveBeenCalledTimes(1);
  });

  describe('when the account changes', () => {
    it.each([
      ['sign-out', signOut.fulfilled(undefined, 'r')],
      ['a failed sign-out', signOut.rejected(new Error('x'), 'r')],
      ['session expiry', sessionExpired()],
      ['a new sign-in', signIn.fulfilled(user, 'r', credentials)],
    ])('forgets the photos and pending images on %s', async (_name, action) => {
      const { store } = await setup();
      await store.dispatch(loadTripPhotos('trip-1'));
      store.dispatch(setPendingPhotos({ tripId: 'trip-1', activityId: null, images: [pickedImage()] }));

      store.dispatch(action);

      expect(selectTripPhotos(store.getState(), 'trip-1')).toEqual([]);
      expect(selectPhotosLoadStatus(store.getState(), 'trip-1')).toBe('idle');
      expect(selectPendingPhotos(store.getState())).toBeNull();
    });

    it('stays idle while signed out, so the next sign-in loads', async () => {
      const { store, owners, dependencies } = await setup();
      const getTripPhotos = jest.spyOn(dependencies.getTripPhotos, 'execute');
      owners.ownerId = null;

      await store.dispatch(loadTripPhotos('trip-1'));

      expect(getTripPhotos).not.toHaveBeenCalled();
      expect(selectPhotosLoadStatus(store.getState(), 'trip-1')).toBe('idle');
    });

    it('ignores a load that finishes after sign-out', async () => {
      const { store } = await setup();
      const loading = store.dispatch(loadTripPhotos('trip-1'));

      store.dispatch(signOut.fulfilled(undefined, 'r'));
      await loading;

      expect(selectTripPhotos(store.getState(), 'trip-1')).toEqual([]);
      expect(selectPhotosLoadStatus(store.getState(), 'trip-1')).toBe('idle');
    });

    it('ignores an attach that finishes after sign-out, and allows new ones', async () => {
      const { store } = await setup([]);
      await store.dispatch(loadTripPhotos('trip-1'));
      const saving = store.dispatch(attachPhotos({ tripId: 'trip-1', activityId: null, images: [pickedImage()] }));

      store.dispatch(signOut.fulfilled(undefined, 'r'));
      expect(selectPhotosSaving(store.getState())).toBe(false);
      await saving;

      expect(selectTripPhotos(store.getState(), 'trip-1')).toEqual([]);
      expect(selectPhotosSaving(store.getState())).toBe(false);
    });
  });
});
