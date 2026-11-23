import { AppError } from '@/core/errors/AppError';
import { err, ok } from '@/core/result';
import { type Activity } from '@/features/itinerary/domain/Activity';
import { type StoredTrip } from '@/features/trips/domain/Trip';
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
import { FakeTripOwnerProvider, OTHER_TRIP_OWNER, storedTrip, TRIP_OWNER } from '@/testing/tripFixtures';

import { MAX_SOURCE_BYTES } from '../imageValidation';
import { type Photo } from '../Photo';
import { type MediaPermission, type PhotoRepository } from '../repositories';
import {
  AttachPhotos,
  DeletePhoto,
  GetActivityPhotos,
  GetMediaPermission,
  GetTripPhotos,
  PickLibraryImages,
  PrunePhotoFiles,
  RequestMediaPermission,
} from './photoUseCases';

const storageFailure = () => err(new AppError('storage', 'disk full'));
const HOUR = 60 * 60 * 1000;

interface SetupOptions {
  readonly trips?: readonly StoredTrip[];
  readonly activities?: readonly Activity[];
  readonly photos?: readonly Photo[];
}

async function setup({ trips = [PHOTOS_TRIP], activities = [PHOTO_ACTIVITY], photos = [] }: SetupOptions = {}) {
  const storage = await seededPhotoDatabase(trips, activities, photos);
  const repository: PhotoRepository = storage.photoRepository;
  const files = new FakePhotoFileStore();
  const processor = new FakeImageProcessor();
  const owners = new FakeTripOwnerProvider();
  const clock = new ManualClock(PHOTOS_NOW);
  const permissions = new FakeMediaPermissionService();
  const picker = new FakePhotoLibraryPicker();
  return {
    ...storage,
    repository,
    files,
    processor,
    owners,
    clock,
    permissions,
    picker,
    attach: new AttachPhotos(
      repository,
      storage.tripRepository,
      storage.activityRepository,
      owners,
      files,
      processor,
      clock,
      sequentialIds('photo'),
    ),
    remove: new DeletePhoto(repository, owners, files),
    prune: new PrunePhotoFiles(repository, files, clock),
    tripPhotos: new GetTripPhotos(repository, storage.tripRepository, owners),
    activityPhotos: new GetActivityPhotos(repository, storage.activityRepository, owners),
    getPermission: new GetMediaPermission(permissions),
    requestPermission: new RequestMediaPermission(permissions),
    pickImages: new PickLibraryImages(picker, permissions),
  };
}

async function savedTripPhotos(repository: PhotoRepository, tripId = 'trip-1', ownerId = TRIP_OWNER) {
  const result = await repository.listByTrip(ownerId, tripId);
  if (!result.ok) throw result.error;
  return result.value;
}

const gif = pickedImage({ uri: 'file:///cache/party.gif', mimeType: 'image/gif', fileName: 'party.gif' });
const huge = pickedImage({ uri: 'file:///cache/huge.jpg', fileSize: MAX_SOURCE_BYTES + 1 });
const broken = pickedImage({ uri: 'file:///cache/broken.jpg', width: 0 });

describe('AttachPhotos', () => {
  it('resizes, copies and saves two library photos for the trip', async () => {
    const { attach, repository, processor, files } = await setup();
    const takenAt = new Date(2027, 6, 2, 10, 15).getTime();
    const images = [
      pickedImage({ uri: 'file:///cache/a.jpg', takenAt }),
      pickedImage({
        uri: 'file:///cache/b.heic',
        mimeType: 'image/heic',
        fileName: 'IMG_2.HEIC',
        width: 3024,
        height: 4032,
      }),
    ];

    const outcome = await attach.execute({ tripId: 'trip-1', activityId: null, images });

    const expected = [
      photo({
        id: 'photo-1',
        reference: 'trip-photos/stored-1.jpg',
        width: 2048,
        height: 1536,
        fileSize: 400_000,
        takenAt,
      }),
      photo({ id: 'photo-2', reference: 'trip-photos/stored-2.jpg', width: 1536, height: 2048, fileSize: 400_000 }),
    ];
    expect(outcome).toEqual({ status: 'saved', photos: expected, rejected: [] });
    expect(processor.process).toHaveBeenNthCalledWith(
      1,
      { uri: 'file:///cache/a.jpg', width: 4032, height: 3024 },
      { maxEdge: 2048, quality: 0.8 },
    );
    expect(processor.process).toHaveBeenNthCalledWith(
      2,
      { uri: 'file:///cache/b.heic', width: 3024, height: 4032 },
      { maxEdge: 2048, quality: 0.8 },
    );
    expect(files.imported).toEqual([
      'file:///cache/ImageManipulator/processed-1.jpg',
      'file:///cache/ImageManipulator/processed-2.jpg',
    ]);
    expect(processor.discarded).toEqual(files.imported);
    expect([...(await savedTripPhotos(repository))].sort((a, b) => a.id.localeCompare(b.id))).toEqual(expected);
  });

  it('keeps a small image at its own size', async () => {
    const { attach } = await setup();
    const outcome = await attach.execute({
      tripId: 'trip-1',
      activityId: null,
      images: [pickedImage({ width: 640, height: 480 })],
    });
    expect(outcome).toMatchObject({ status: 'saved', photos: [{ width: 640, height: 480 }] });
  });

  it('attaches a camera photo to an activity of the trip', async () => {
    const { attach, repository } = await setup();
    const outcome = await attach.execute({
      tripId: 'trip-1',
      activityId: 'act-1',
      images: [pickedImage({ uri: 'file:///cache/Camera/capture.jpg', source: 'camera', fileName: null })],
    });

    expect(outcome).toMatchObject({
      status: 'saved',
      photos: [{ tripId: 'trip-1', activityId: 'act-1', source: 'camera', mimeType: 'image/jpeg' }],
    });
    const byActivity = await repository.listByActivity(TRIP_OWNER, 'act-1');
    expect(byActivity.ok && byActivity.value.map(({ id }) => id)).toEqual(['photo-1']);
    expect((await savedTripPhotos(repository)).map(({ id }) => id)).toEqual(['photo-1']);
  });

  it('names each rejected image and still attaches the valid ones', async () => {
    const { attach, processor, repository } = await setup();
    const images = [
      pickedImage({ uri: 'file:///cache/first.jpg' }),
      gif,
      huge,
      broken,
      pickedImage({ uri: 'file:///cache/last.png', mimeType: 'image/png', fileName: 'last.png' }),
    ];

    const outcome = await attach.execute({ tripId: 'trip-1', activityId: null, images });

    expect(outcome).toMatchObject({
      status: 'saved',
      rejected: [
        { index: 1, reason: 'unsupportedType' },
        { index: 2, reason: 'tooLarge' },
        { index: 3, reason: 'invalidDimensions' },
      ],
    });
    expect(outcome.status === 'saved' && outcome.photos).toHaveLength(2);
    expect(processor.process.mock.calls.map(([source]) => source.uri)).toEqual([
      'file:///cache/first.jpg',
      'file:///cache/last.png',
    ]);
    expect(await savedTripPhotos(repository)).toHaveLength(2);
  });

  it('saves nothing and copies nothing when no image is valid', async () => {
    const { attach, processor, files, repository } = await setup();

    const outcome = await attach.execute({ tripId: 'trip-1', activityId: null, images: [gif, broken] });

    expect(outcome).toEqual({
      status: 'invalid',
      rejected: [
        { index: 0, reason: 'unsupportedType' },
        { index: 1, reason: 'invalidDimensions' },
      ],
    });
    expect(processor.process).not.toHaveBeenCalled();
    expect(files.imported).toEqual([]);
    expect(await savedTripPhotos(repository)).toEqual([]);
  });

  it('treats an empty selection as nothing to attach', async () => {
    const { attach } = await setup();
    await expect(attach.execute({ tripId: 'trip-1', activityId: null, images: [] })).resolves.toEqual({
      status: 'invalid',
      rejected: [],
    });
  });

  it('leaves nothing behind when processing a later image fails', async () => {
    const { attach, processor, files, repository } = await setup();
    processor.failing.add('file:///cache/second.jpg');

    const outcome = await attach.execute({
      tripId: 'trip-1',
      activityId: null,
      images: [pickedImage({ uri: 'file:///cache/first.jpg' }), pickedImage({ uri: 'file:///cache/second.jpg' })],
    });

    expect(outcome.status === 'failed' && outcome.error.kind).toBe('storage');
    expect(files.removed).toEqual(['trip-photos/stored-1.jpg']);
    expect(files.files.size).toBe(0);
    expect(await savedTripPhotos(repository)).toEqual([]);
  });

  it('leaves nothing behind when copying a later image fails, and discards its processed copy', async () => {
    const { attach, processor, files, repository } = await setup();
    files.failImportAt = 2;

    const outcome = await attach.execute({
      tripId: 'trip-1',
      activityId: null,
      images: [pickedImage({ uri: 'file:///cache/first.jpg' }), pickedImage({ uri: 'file:///cache/second.jpg' })],
    });

    expect(outcome.status === 'failed' && outcome.error.kind).toBe('storage');
    expect(files.removed).toEqual(['trip-photos/stored-1.jpg']);
    expect(processor.discarded).toEqual(
      expect.arrayContaining([
        'file:///cache/ImageManipulator/processed-1.jpg',
        'file:///cache/ImageManipulator/processed-2.jpg',
      ]),
    );
    expect(await savedTripPhotos(repository)).toEqual([]);
  });

  it('removes every copied file when the rows cannot be saved', async () => {
    const { attach, files, repository } = await setup();
    jest.spyOn(repository, 'insertMany').mockResolvedValueOnce(storageFailure());

    const outcome = await attach.execute({
      tripId: 'trip-1',
      activityId: null,
      images: [pickedImage({ uri: 'file:///cache/a.jpg' }), pickedImage({ uri: 'file:///cache/b.jpg' })],
    });

    expect(outcome.status === 'failed' && outcome.error.kind).toBe('storage');
    expect([...files.removed].sort()).toEqual(['trip-photos/stored-1.jpg', 'trip-photos/stored-2.jpg']);
    expect(files.files.size).toBe(0);
  });

  it.each<[string, SetupOptions, string | null, string]>([
    ['a missing trip', { trips: [], activities: [] }, null, 'trip-1'],
    ['a missing activity', {}, 'gone', 'trip-1'],
    [
      'an activity of another trip',
      {
        trips: [PHOTOS_TRIP, storedTrip({ id: 'trip-2', startDate: '2027-09-01', endDate: '2027-09-03' })],
        activities: [PHOTO_ACTIVITY, activity({ id: 'act-other', tripId: 'trip-2', date: '2027-09-01' })],
      },
      'act-other',
      'trip-1',
    ],
  ])('is notFound for %s and touches no file', async (_name, options, activityId, tripId) => {
    const { attach, processor, files } = await setup(options);

    const outcome = await attach.execute({ tripId, activityId, images: [pickedImage()] });

    expect(outcome.status === 'failed' && outcome.error.kind).toBe('notFound');
    expect(processor.process).not.toHaveBeenCalled();
    expect(files.imported).toEqual([]);
  });

  it("is notFound for another account's trip or activity", async () => {
    const { attach, owners, files } = await setup();
    owners.ownerId = OTHER_TRIP_OWNER;

    const toTrip = await attach.execute({ tripId: 'trip-1', activityId: null, images: [pickedImage()] });
    const toActivity = await attach.execute({ tripId: 'trip-1', activityId: 'act-1', images: [pickedImage()] });

    expect(toTrip).toMatchObject({ status: 'failed', error: { kind: 'notFound' } });
    expect(toActivity).toMatchObject({ status: 'failed', error: { kind: 'notFound' } });
    expect(files.imported).toEqual([]);
  });

  it('refuses when nobody is signed in', async () => {
    const { attach, owners, files } = await setup();
    owners.ownerId = null;

    const outcome = await attach.execute({ tripId: 'trip-1', activityId: null, images: [pickedImage()] });

    expect(outcome).toMatchObject({ status: 'failed', error: { kind: 'unauthorized' } });
    expect(files.imported).toEqual([]);
  });

  it('attaches only up to 200 photos per trip and names the rest', async () => {
    const existing = Array.from({ length: 199 }, (_, index) =>
      photo({ id: `old-${index}`, reference: `trip-photos/old-${index}.jpg`, createdAt: index }),
    );
    const { attach, repository } = await setup({ photos: existing });

    const outcome = await attach.execute({
      tripId: 'trip-1',
      activityId: null,
      images: [
        pickedImage({ uri: 'file:///cache/1.jpg' }),
        pickedImage({ uri: 'file:///cache/2.jpg' }),
        pickedImage({ uri: 'file:///cache/3.jpg' }),
      ],
    });

    expect(outcome).toMatchObject({
      status: 'saved',
      rejected: [
        { index: 1, reason: 'limitReached' },
        { index: 2, reason: 'limitReached' },
      ],
    });
    expect(await savedTripPhotos(repository)).toHaveLength(200);
  });
});

describe('DeletePhoto', () => {
  it('deletes the row and then the file', async () => {
    const { remove, repository, files } = await setup({ photos: [photo({ reference: 'trip-photos/a.jpg' })] });

    await expect(remove.execute('photo-1')).resolves.toEqual({ ok: true, value: undefined });

    expect(await savedTripPhotos(repository)).toEqual([]);
    expect(files.removed).toEqual(['trip-photos/a.jpg']);
  });

  it('still deletes a photo whose file is already gone', async () => {
    const { remove, repository, files } = await setup({ photos: [photo({ reference: 'trip-photos/a.jpg' })] });
    files.missing.add('trip-photos/a.jpg');

    await expect(remove.execute('photo-1')).resolves.toEqual({ ok: true, value: undefined });
    expect(await savedTripPhotos(repository)).toEqual([]);
  });

  it('keeps the photo and its file when the row cannot be deleted', async () => {
    const { remove, repository, files } = await setup({ photos: [photo()] });
    jest.spyOn(repository, 'delete').mockResolvedValueOnce(storageFailure());

    const result = await remove.execute('photo-1');

    expect(!result.ok && result.error.kind).toBe('storage');
    expect(files.removed).toEqual([]);
    expect(await savedTripPhotos(repository)).toHaveLength(1);
  });

  it("is notFound for a missing photo or another account's photo", async () => {
    const { remove, owners, files, repository } = await setup({ photos: [photo()] });

    const missing = await remove.execute('gone');
    owners.ownerId = OTHER_TRIP_OWNER;
    const theirs = await remove.execute('photo-1');

    expect(!missing.ok && missing.error.kind).toBe('notFound');
    expect(!theirs.ok && theirs.error.kind).toBe('notFound');
    expect(files.removed).toEqual([]);
    expect(await savedTripPhotos(repository)).toHaveLength(1);
  });

  it('refuses when nobody is signed in', async () => {
    const { remove, owners } = await setup({ photos: [photo()] });
    owners.ownerId = null;
    const result = await remove.execute('photo-1');
    expect(!result.ok && result.error.kind).toBe('unauthorized');
  });
});

describe('PrunePhotoFiles', () => {
  it('removes old files no photo references and keeps referenced and recent ones', async () => {
    const { prune, files } = await setup({ photos: [photo({ reference: 'trip-photos/kept.jpg' })] });
    files.files.set('trip-photos/kept.jpg', PHOTOS_NOW - 30 * 24 * HOUR);
    files.files.set('trip-photos/orphan.jpg', PHOTOS_NOW - 61 * 60 * 1000);
    files.files.set('trip-photos/in-flight.jpg', PHOTOS_NOW - 59 * 60 * 1000);

    await expect(prune.execute()).resolves.toEqual({ ok: true, value: 1 });

    expect(files.removed).toEqual(['trip-photos/orphan.jpg']);
  });

  it("keeps files that another account's photos reference", async () => {
    const storage = await seededPhotoDatabase();
    await storage.tripRepository.insert(OTHER_TRIP_OWNER, storedTrip({ id: 'their-trip' }));
    await storage.photoRepository.insertMany(OTHER_TRIP_OWNER, [
      photo({ id: 'theirs', tripId: 'their-trip', reference: 'trip-photos/theirs.jpg' }),
    ]);
    const files = new FakePhotoFileStore();
    files.files.set('trip-photos/theirs.jpg', 0);

    const result = await new PrunePhotoFiles(storage.photoRepository, files, new ManualClock(PHOTOS_NOW)).execute();

    expect(result).toEqual({ ok: true, value: 0 });
    expect(files.removed).toEqual([]);
  });

  it('removes nothing when the stored files cannot be listed', async () => {
    const { prune, files } = await setup();
    files.files.set('trip-photos/orphan.jpg', 0);
    files.listFailure = new AppError('storage', 'unreadable');

    const result = await prune.execute();

    expect(!result.ok && result.error.kind).toBe('storage');
    expect(files.removed).toEqual([]);
  });

  it('removes nothing when the references cannot be read', async () => {
    const { prune, files, repository } = await setup();
    files.files.set('trip-photos/orphan.jpg', 0);
    jest.spyOn(repository, 'allReferences').mockResolvedValueOnce(storageFailure());

    const result = await prune.execute();

    expect(!result.ok && result.error.kind).toBe('storage');
    expect(files.removed).toEqual([]);
  });
});

describe('GetTripPhotos / GetActivityPhotos', () => {
  const trip2 = storedTrip({ id: 'trip-2', startDate: '2027-09-01', endDate: '2027-09-03' });
  const photos = [
    photo({ id: 'oldest', reference: 'trip-photos/oldest.jpg', createdAt: 1 }),
    photo({ id: 'newest', reference: 'trip-photos/newest.jpg', activityId: 'act-1', createdAt: 3 }),
    photo({ id: 'middle', reference: 'trip-photos/middle.jpg', createdAt: 2 }),
    photo({ id: 'elsewhere', tripId: 'trip-2', reference: 'trip-photos/elsewhere.jpg', createdAt: 4 }),
  ];

  it("lists the trip's photos, its activities' included, newest first", async () => {
    const { tripPhotos } = await setup({ trips: [PHOTOS_TRIP, trip2], photos });
    const result = await tripPhotos.execute('trip-1');
    expect(result.ok && result.value.map(({ id }) => id)).toEqual(['newest', 'middle', 'oldest']);
  });

  it("lists only the activity's photos", async () => {
    const { activityPhotos } = await setup({ trips: [PHOTOS_TRIP, trip2], photos });
    const result = await activityPhotos.execute({ tripId: 'trip-1', activityId: 'act-1' });
    expect(result.ok && result.value.map(({ id }) => id)).toEqual(['newest']);
  });

  it('is notFound for a missing trip, or an activity of another trip', async () => {
    const { tripPhotos, activityPhotos } = await setup({ trips: [PHOTOS_TRIP, trip2], photos });

    const trip = await tripPhotos.execute('gone');
    const elsewhere = await activityPhotos.execute({ tripId: 'trip-2', activityId: 'act-1' });

    expect(!trip.ok && trip.error.kind).toBe('notFound');
    expect(!elsewhere.ok && elsewhere.error.kind).toBe('notFound');
  });

  it("treats another account's trip and activity as missing, and refuses when signed out", async () => {
    const { tripPhotos, activityPhotos, owners } = await setup({ photos });

    owners.ownerId = OTHER_TRIP_OWNER;
    const theirTrip = await tripPhotos.execute('trip-1');
    const theirActivity = await activityPhotos.execute({ tripId: 'trip-1', activityId: 'act-1' });
    owners.ownerId = null;
    const signedOut = await tripPhotos.execute('trip-1');

    expect(!theirTrip.ok && theirTrip.error.kind).toBe('notFound');
    expect(!theirActivity.ok && theirActivity.error.kind).toBe('notFound');
    expect(!signedOut.ok && signedOut.error.kind).toBe('unauthorized');
  });
});

describe('media permissions', () => {
  it('reads and requests the permission of the kind asked for', async () => {
    const { getPermission, requestPermission, permissions } = await setup();
    permissions.permissions = { camera: 'blocked', library: 'limited' };

    await expect(getPermission.execute('camera')).resolves.toBe('blocked');
    await expect(getPermission.execute('library')).resolves.toBe('limited');

    permissions.permissions.camera = 'undetermined';
    await expect(requestPermission.execute('camera')).resolves.toBe('granted');
    expect(permissions.requestPermission).toHaveBeenCalledTimes(1);
    expect(permissions.requestPermission).toHaveBeenCalledWith('camera');
  });
});

describe('PickLibraryImages', () => {
  it.each<MediaPermission>(['granted', 'limited'])(
    'opens the picker for up to 10 images when access is %s',
    async (permission) => {
      const { pickImages, picker, permissions } = await setup();
      permissions.permissions.library = permission;
      const images = [pickedImage(), pickedImage({ uri: 'file:///cache/b.jpg' })];
      picker.result = ok(images);

      await expect(pickImages.execute()).resolves.toEqual({ ok: true, value: images });
      expect(picker.pickImages).toHaveBeenCalledWith({ selectionLimit: 10 });
    },
  );

  it.each<MediaPermission>(['undetermined', 'denied', 'blocked'])(
    'never opens the picker or prompts when access is %s',
    async (permission) => {
      const { pickImages, picker, permissions } = await setup();
      permissions.permissions.library = permission;

      const result = await pickImages.execute();

      expect(!result.ok && result.error.kind).toBe('forbidden');
      expect(picker.pickImages).not.toHaveBeenCalled();
      expect(permissions.requestPermission).not.toHaveBeenCalled();
    },
  );

  it('returns null when the traveller cancels', async () => {
    const { pickImages, permissions } = await setup();
    permissions.allow('library');
    await expect(pickImages.execute()).resolves.toEqual({ ok: true, value: null });
  });

  it('passes on a picker failure', async () => {
    const { pickImages, picker, permissions } = await setup();
    permissions.allow('library');
    picker.result = err(new AppError('unknown', 'no activity'));
    const result = await pickImages.execute();
    expect(!result.ok && result.error.kind).toBe('unknown');
  });
});
