import { AppError } from '@/core/errors/AppError';
import { err } from '@/core/result';
import { activity } from '@/testing/itineraryFixtures';
import { ManualClock, sequentialIds } from '@/testing/ManualClock';
import {
  FakeImageProcessor,
  FakeMediaPermissionService,
  FakePhotoFileStore,
  FakePhotoLibraryPicker,
  photo,
  PHOTO_ACTIVITY,
  PHOTOS_NOW,
  PHOTOS_TRIP,
  pickedImage,
  seededPhotoDatabase,
} from '@/testing/photoFixtures';
import { FakeTripOwnerProvider, OTHER_TRIP_OWNER, storedTrip } from '@/testing/tripFixtures';

import { MAX_PHOTOS_PER_TRIP } from '../imageValidation';
import { type Photo } from '../Photo';
import { AttachPhotos, DeletePhoto, PickLibraryImages, PrunePhotoFiles } from './photoUseCases';

async function setup(photos: readonly Photo[] = []) {
  const otherTrip = storedTrip({ id: 'trip-2', title: 'Porto' });
  const otherActivity = activity({ id: 'act-2', tripId: 'trip-2', title: 'Ribeira' });
  const storage = await seededPhotoDatabase([PHOTOS_TRIP, otherTrip], [PHOTO_ACTIVITY, otherActivity], photos);
  const files = new FakePhotoFileStore();
  const processor = new FakeImageProcessor();
  const owners = new FakeTripOwnerProvider();
  const clock = new ManualClock(PHOTOS_NOW);
  return {
    ...storage,
    files,
    processor,
    owners,
    clock,
    attach: new AttachPhotos(
      storage.photoRepository,
      storage.tripRepository,
      storage.activityRepository,
      owners,
      files,
      processor,
      clock,
      sequentialIds('photo'),
    ),
    remove: new DeletePhoto(storage.photoRepository, owners, files),
    prune: new PrunePhotoFiles(storage.photoRepository, files, clock),
  };
}

async function tripPhotoCount(repository: Awaited<ReturnType<typeof setup>>['photoRepository']) {
  const result = await repository.countByTrip('owner-1', 'trip-1');
  return result;
}

describe('AttachPhotos edge cases', () => {
  it('rolls back every copied file when the third of three imports fails', async () => {
    const { attach, files, photoRepository } = await setup();
    files.failImportAt = 3;
    const images = [1, 2, 3].map((n) => pickedImage({ uri: `file:///cache/${n}.jpg` }));

    const outcome = await attach.execute({ tripId: 'trip-1', activityId: null, images });

    expect(outcome.status).toBe('failed');
    expect(files.removed.sort()).toEqual(['trip-photos/stored-1.jpg', 'trip-photos/stored-2.jpg']);
    expect(files.files.size).toBe(0);
    const listed = await photoRepository.listByTrip('owner-1', 'trip-1');
    expect(listed.ok && listed.value).toEqual([]);
    expect(await tripPhotoCount(photoRepository)).toEqual({ ok: true, value: 0 });
  });

  it('rolls back earlier copies when the second image cannot be processed', async () => {
    const { attach, files, processor } = await setup();
    processor.failing.add('file:///cache/bad.jpg');

    const outcome = await attach.execute({
      tripId: 'trip-1',
      activityId: null,
      images: [pickedImage({ uri: 'file:///cache/ok.jpg' }), pickedImage({ uri: 'file:///cache/bad.jpg' })],
    });

    expect(outcome.status).toBe('failed');
    expect(files.files.size).toBe(0);
  });

  it('discards the processed temp file even when the copy into storage fails', async () => {
    const { attach, files, processor } = await setup();
    files.failImports = true;

    await attach.execute({ tripId: 'trip-1', activityId: null, images: [pickedImage()] });

    expect(processor.discarded).toEqual(['file:///cache/ImageManipulator/processed-1.jpg']);
  });

  it('returns invalid with every index rejected for an empty selection result of bad images', async () => {
    const { attach, files } = await setup();
    const outcome = await attach.execute({
      tripId: 'trip-1',
      activityId: null,
      images: [pickedImage({ mimeType: 'image/gif', fileName: 'a.gif' }), pickedImage({ width: 0 })],
    });
    expect(outcome).toEqual({
      status: 'invalid',
      rejected: [
        { index: 0, reason: 'unsupportedType' },
        { index: 1, reason: 'invalidDimensions' },
      ],
    });
    expect(files.imported).toEqual([]);
  });

  it('attaches nothing for an empty selection', async () => {
    const { attach } = await setup();
    expect(await attach.execute({ tripId: 'trip-1', activityId: null, images: [] })).toEqual({
      status: 'invalid',
      rejected: [],
    });
  });

  it('saves only the images that fit the per-trip limit and flags the rest as limitReached', async () => {
    const existing = Array.from({ length: MAX_PHOTOS_PER_TRIP - 1 }, (_, i) =>
      photo({ id: `old-${i}`, reference: `trip-photos/old-${i}.jpg` }),
    );
    const { attach } = await setup(existing);

    const outcome = await attach.execute({
      tripId: 'trip-1',
      activityId: null,
      images: [pickedImage({ uri: 'file:///a.jpg' }), pickedImage({ uri: 'file:///b.jpg' })],
    });

    expect(outcome).toMatchObject({ status: 'saved', rejected: [{ index: 1, reason: 'limitReached' }] });
  });

  it('counts photos of other trips separately from the limit', async () => {
    const existing = Array.from({ length: MAX_PHOTOS_PER_TRIP }, (_, i) =>
      photo({ id: `old-${i}`, reference: `trip-photos/old-${i}.jpg`, tripId: 'trip-2' }),
    );
    const { attach } = await setup(existing);
    const outcome = await attach.execute({ tripId: 'trip-1', activityId: null, images: [pickedImage()] });
    expect(outcome.status).toBe('saved');
  });

  it('rejects an activity that belongs to a different trip without copying files', async () => {
    const { attach, files } = await setup();
    const outcome = await attach.execute({ tripId: 'trip-1', activityId: 'act-2', images: [pickedImage()] });
    expect(outcome).toMatchObject({ status: 'failed', error: { kind: 'notFound' } });
    expect(files.imported).toEqual([]);
  });

  it('fails as unauthorized when nobody is signed in', async () => {
    const { attach, owners, files } = await setup();
    jest.spyOn(owners, 'currentOwnerId').mockReturnValue(null);
    const outcome = await attach.execute({ tripId: 'trip-1', activityId: null, images: [pickedImage()] });
    expect(outcome).toMatchObject({ status: 'failed', error: { kind: 'unauthorized' } });
    expect(files.imported).toEqual([]);
  });

  it('fails as notFound for a trip owned by another account', async () => {
    const { attach, owners } = await setup();
    jest.spyOn(owners, 'currentOwnerId').mockReturnValue(OTHER_TRIP_OWNER);
    const outcome = await attach.execute({ tripId: 'trip-1', activityId: null, images: [pickedImage()] });
    expect(outcome).toMatchObject({ status: 'failed', error: { kind: 'notFound' } });
  });
});

describe('DeletePhoto edge cases', () => {
  it('still deletes the row when the file is already gone', async () => {
    const { remove, photoRepository, files } = await setup([photo({ id: 'p1', reference: 'trip-photos/p1.jpg' })]);
    files.missing.add('trip-photos/p1.jpg');
    expect(await remove.execute('p1')).toEqual({ ok: true, value: undefined });
    const found = await photoRepository.findById('owner-1', 'p1');
    expect(found.ok && found.value).toBeNull();
  });

  it('reports notFound when deleting the same photo twice', async () => {
    const { remove } = await setup([photo({ id: 'p1', reference: 'trip-photos/p1.jpg' })]);
    await remove.execute('p1');
    expect(await remove.execute('p1')).toMatchObject({ ok: false, error: { kind: 'notFound' } });
  });

  it('does not delete the file when the row delete fails', async () => {
    const { remove, files, photoRepository } = await setup([photo({ id: 'p1', reference: 'trip-photos/p1.jpg' })]);
    jest.spyOn(photoRepository, 'delete').mockResolvedValue(err(new AppError('storage', 'locked')));
    expect(await remove.execute('p1')).toMatchObject({ ok: false });
    expect(files.removed).toEqual([]);
  });
});

describe('PrunePhotoFiles edge cases', () => {
  it('keeps an unreferenced file younger than an hour and removes one exactly older than the cutoff', async () => {
    const { prune, files, clock } = await setup();
    files.files.set('trip-photos/young.jpg', clock.now() - 60 * 60 * 1000 + 1);
    files.files.set('trip-photos/old.jpg', clock.now() - 60 * 60 * 1000 - 1);
    expect(await prune.execute()).toEqual({ ok: true, value: 1 });
    expect(files.removed).toEqual(['trip-photos/old.jpg']);
  });

  it('never removes a referenced file however old', async () => {
    const { prune, files } = await setup([photo({ id: 'p1', reference: 'trip-photos/p1.jpg' })]);
    files.files.set('trip-photos/p1.jpg', 0);
    expect(await prune.execute()).toEqual({ ok: true, value: 0 });
  });
});

describe('PickLibraryImages edge cases', () => {
  it.each(['denied', 'blocked', 'undetermined'] as const)(
    'does not open the picker when access is %s',
    async (state) => {
      const picker = new FakePhotoLibraryPicker();
      const permissions = new FakeMediaPermissionService();
      permissions.permissions.library = state;
      const result = await new PickLibraryImages(picker, permissions).execute();
      expect(result).toMatchObject({ ok: false, error: { kind: 'forbidden' } });
      expect(picker.pickImages).not.toHaveBeenCalled();
    },
  );

  it('opens the picker with limited access', async () => {
    const picker = new FakePhotoLibraryPicker();
    const permissions = new FakeMediaPermissionService();
    permissions.permissions.library = 'limited';
    await new PickLibraryImages(picker, permissions).execute();
    expect(picker.pickImages).toHaveBeenCalledWith({ selectionLimit: 10 });
  });
});
