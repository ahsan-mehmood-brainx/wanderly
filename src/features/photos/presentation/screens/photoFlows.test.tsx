import { fireEvent, userEvent } from '@testing-library/react-native';
import { type Href, router, Stack } from 'expo-router';
import { act, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import ActivityRoute from '@/app/(app)/(tabs)/trips/[tripId]/itinerary/[itemId]';
import ActivityPhotosRoute from '@/app/(app)/(tabs)/trips/[tripId]/itinerary/[itemId]/photos';
import TripRoute from '@/app/(app)/(tabs)/trips/[tripId]/index';
import PhotoRoute from '@/app/(app)/(tabs)/trips/[tripId]/photos/[photoId]';
import PhotoCameraRoute from '@/app/(app)/(tabs)/trips/[tripId]/photos/camera';
import TripPhotosRoute from '@/app/(app)/(tabs)/trips/[tripId]/photos/index';
import PhotoPreviewRoute from '@/app/(app)/(tabs)/trips/[tripId]/photos/preview';
import { AppProviders } from '@/bootstrap/AppProviders';
import { type AppDependencies } from '@/core/di/AppDependencies';
import { AppError } from '@/core/errors/AppError';
import { createI18n } from '@/core/i18n/createI18n';
import { err, ok } from '@/core/result';
import { MAX_SOURCE_BYTES } from '@/features/photos/domain/imageValidation';
import { type Photo } from '@/features/photos/domain/Photo';
import { createTestStore } from '@/testing/createTestStore';
import { ManualClock } from '@/testing/ManualClock';
import {
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
import { createTestDependencies } from '@/testing/testDependencies';
import { FakeTripCoverStore, TRIP_OWNER } from '@/testing/tripFixtures';

interface Fakes {
  readonly permissions: FakeMediaPermissionService;
  readonly picker: FakePhotoLibraryPicker;
  readonly files: FakePhotoFileStore;
}

interface LaunchOptions {
  readonly photos?: readonly Photo[];
  readonly configure?: (fakes: Fakes) => void;
  /** Runs SQL against the seeded database before the app renders. */
  readonly prepare?: (database: Awaited<ReturnType<typeof seededPhotoDatabase>>['database']) => Promise<void>;
  readonly overrides?: Partial<AppDependencies>;
}

const { mockCamera } = jest.requireMock<{ mockCamera: { takePictureAsync: jest.Mock } }>('expo-camera');

async function launch(initialUrl: string, { photos = [], configure, prepare, overrides = {} }: LaunchOptions = {}) {
  const storage = await seededPhotoDatabase([PHOTOS_TRIP], [PHOTO_ACTIVITY], photos);
  await prepare?.(storage.database);
  const fakes: Fakes = {
    permissions: new FakeMediaPermissionService(),
    picker: new FakePhotoLibraryPicker(),
    files: new FakePhotoFileStore(),
  };
  configure?.(fakes);
  const covers = new FakeTripCoverStore();
  const dependencies = createTestDependencies({
    database: storage.database,
    clock: new ManualClock(PHOTOS_NOW),
    mediaPermissionService: fakes.permissions,
    photoLibraryPicker: fakes.picker,
    photoFileStore: fakes.files,
    tripCoverStore: covers,
    ...overrides,
  });
  const container = { dependencies, store: createTestStore(dependencies), i18n: createI18n('en') };

  await renderRouter(
    {
      _layout: () => (
        <AppProviders container={container}>
          <Stack screenOptions={{ headerShown: false }} />
        </AppProviders>
      ),
      'trips/[tripId]/index': TripRoute,
      'trips/[tripId]/photos/index': TripPhotosRoute,
      'trips/[tripId]/photos/camera': PhotoCameraRoute,
      'trips/[tripId]/photos/preview': PhotoPreviewRoute,
      'trips/[tripId]/photos/[photoId]': PhotoRoute,
      'trips/[tripId]/itinerary/[itemId]': ActivityRoute,
      'trips/[tripId]/itinerary/[itemId]/photos': ActivityPhotosRoute,
    },
    { initialUrl },
  );
  return { ...storage, ...fakes, covers, dependencies, user: userEvent.setup() };
}

type Launched = Awaited<ReturnType<typeof launch>>;

async function savedPhotos({ photoRepository }: Launched, tripId = 'trip-1') {
  const result = await photoRepository.listByTrip(TRIP_OWNER, tripId);
  if (!result.ok) throw result.error;
  return result.value;
}

async function tripCover({ tripRepository }: Launched) {
  const result = await tripRepository.findById(TRIP_OWNER, 'trip-1');
  if (!result.ok) throw result.error;
  return result.value?.coverImage ?? null;
}

const button = (name: string | RegExp) => screen.findByRole('button', { name });
const tiles = () => screen.queryAllByTestId(/^photo-tile-/);
const navigate = (href: string) => act(async () => router.push(href as Href));

interface RenderedNode {
  readonly props?: { readonly source?: unknown };
  readonly children?: readonly unknown[];
}

/** True when the element, or something inside it, is an image showing `uri`. */
function showsImage(element: unknown, uri: string): boolean {
  const node = element as RenderedNode;
  if (JSON.stringify(node.props?.source ?? null).includes(uri)) return true;
  return (node.children ?? []).some((child) => typeof child === 'object' && child !== null && showsImage(child, uri));
}

const STORAGE_ERROR = "We couldn't access data saved on this device.";
const CAPTURED_AT = new Date(2027, 5, 15, 9, 30, 0).getTime();
const tripPhoto = photo({ id: 'beach', reference: 'trip-photos/beach.jpg', createdAt: 1 });
const activityPhoto = photo({ id: 'tower', reference: 'trip-photos/tower.jpg', activityId: 'act-1', createdAt: 2 });

afterEach(() => {
  jest.restoreAllMocks();
  mockCamera.takePictureAsync.mockClear();
});

describe('Trip gallery', () => {
  it('opens from the trip details, which shows how many photos there are', async () => {
    const { user } = await launch('/trips/trip-1', { photos: [tripPhoto, activityPhoto] });

    await user.press(await button(/View photos/));

    expect(await screen.findByTestId('photo-gallery')).toBeOnTheScreen();
    await waitFor(() => expect(tiles()).toHaveLength(2));
  });

  it("shows the trip's own and its activities' photos, newest first, labelling activity photos", async () => {
    await launch('/trips/trip-1/photos', { photos: [tripPhoto, activityPhoto] });

    await screen.findByTestId('photo-gallery');
    await waitFor(() =>
      expect(tiles().map((node) => node.props.testID)).toEqual(['photo-tile-tower', 'photo-tile-beach']),
    );
    expect(within(screen.getByTestId('photo-tile-tower')).getByText('Belém Tower')).toBeOnTheScreen();
    expect(within(screen.getByTestId('photo-tile-beach')).queryByText('Belém Tower')).toBeNull();
    expect(showsImage(screen.getByTestId('photo-tile-beach'), 'file:///documents/trip-photos/beach.jpg')).toBe(true);
  });

  it('shows an empty state with a way to add the first photo', async () => {
    await launch('/trips/trip-1/photos');

    expect(await screen.findByTestId('photo-gallery-empty')).toBeOnTheScreen();
    expect(await button('Add photo')).toBeOnTheScreen();
  });

  it('shows a placeholder for a missing or invalid file instead of crashing', async () => {
    await launch('/trips/trip-1/photos', {
      photos: [
        photo({ id: 'gone', reference: 'trip-photos/gone.jpg', createdAt: 3 }),
        photo({ id: 'odd', reference: 'trip-photos/odd.jpg', createdAt: 2 }),
        tripPhoto,
      ],
      configure: ({ files }) => files.missing.add('trip-photos/gone.jpg'),
      prepare: async (database) => {
        await database.run('PRAGMA ignore_check_constraints = ON');
        await database.run("UPDATE photos SET reference = '../../etc/passwd' WHERE id = 'odd'");
        await database.run('PRAGMA ignore_check_constraints = OFF');
      },
    });

    await waitFor(() => expect(tiles()).toHaveLength(3));
    expect(within(screen.getByTestId('photo-tile-gone')).getByText('Photo unavailable')).toBeOnTheScreen();
    expect(within(screen.getByTestId('photo-tile-odd')).getByText('Photo unavailable')).toBeOnTheScreen();
    expect(within(screen.getByTestId('photo-tile-beach')).queryByText('Photo unavailable')).toBeNull();
  });

  it('shows a storage failure with a retry that recovers', async () => {
    const getTripPhotos = {
      execute: jest.fn().mockResolvedValueOnce(err(new AppError('storage', 'locked'))),
    };
    const { user, dependencies } = await launch('/trips/trip-1/photos', {
      photos: [tripPhoto],
      overrides: { getTripPhotos },
    });
    getTripPhotos.execute.mockImplementation((tripId: string) =>
      dependencies.photoRepository.listByTrip(TRIP_OWNER, tripId),
    );

    expect(await screen.findByText(STORAGE_ERROR)).toBeOnTheScreen();
    await user.press(await button('Try again'));

    await waitFor(() => expect(tiles()).toHaveLength(1));
  });

  it('says when the trip does not exist', async () => {
    await launch('/trips/gone/photos');
    expect(await screen.findByText('Trip not found')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Add photo' })).toBeNull();
  });

  it('says photos are available in the mobile app where photos cannot be stored (web)', async () => {
    const files = new FakePhotoFileStore();
    Object.defineProperty(files, 'supported', { value: false });
    await launch('/trips/trip-1/photos', { overrides: { photoFileStore: files } });

    expect(await screen.findByText('Photos are available in the mobile app')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Add photo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Take photo' })).toBeNull();
  });
});

describe('Attach from the library', () => {
  const takenAt = new Date(2027, 6, 2, 10, 15, 0).getTime();
  const first = pickedImage({ uri: 'file:///cache/ImagePicker/a.jpg', takenAt });
  const second = pickedImage({
    uri: 'file:///cache/ImagePicker/b.heic',
    mimeType: 'image/heic',
    fileName: 'IMG_2.HEIC',
    width: 3024,
    height: 4032,
  });

  it('previews the picked images locally, saves them in SQLite and shows them in the gallery', async () => {
    const launched = await launch('/trips/trip-1/photos', {
      configure: ({ permissions, picker }) => {
        permissions.allow('library');
        picker.result = ok([first, second]);
      },
    });
    const { user, picker, permissions } = launched;

    await user.press(await button('Add photo'));
    await user.press(await button('Choose from library'));

    const preview = await screen.findByTestId('photo-preview');
    expect(within(preview).getAllByTestId(/^preview-item-/)).toHaveLength(2);
    expect(showsImage(screen.getByTestId('preview-item-0'), first.uri)).toBe(true);
    expect(showsImage(screen.getByTestId('preview-item-1'), second.uri)).toBe(true);
    expect(picker.pickImages).toHaveBeenCalledTimes(1);
    expect(permissions.requestPermission).not.toHaveBeenCalled();

    await user.press(await button(/^Attach/));

    expect(await screen.findByTestId('photo-gallery')).toBeOnTheScreen();
    await waitFor(() => expect(tiles()).toHaveLength(2));
    const saved = await savedPhotos(launched);
    expect(saved).toHaveLength(2);
    for (const item of saved) {
      expect(item).toMatchObject({
        tripId: 'trip-1',
        activityId: null,
        mimeType: 'image/jpeg',
        source: 'library',
        createdAt: PHOTOS_NOW,
      });
      expect(item.reference).toMatch(/^trip-photos\/[\w-]+\.jpg$/);
      expect(Math.max(item.width, item.height)).toBe(2048);
      expect(item.fileSize).toBeGreaterThan(0);
    }
    expect(saved.map(({ takenAt: taken }) => taken).sort()).toEqual([takenAt, null].sort());
  });

  it('counts limited (selected photos only) access as allowed', async () => {
    const { user, picker } = await launch('/trips/trip-1/photos', {
      configure: ({ permissions, picker: fake }) => {
        permissions.permissions.library = 'limited';
        fake.result = ok([first]);
      },
    });

    await user.press(await button('Add photo'));
    await user.press(await button('Choose from library'));

    expect(await screen.findByTestId('photo-preview')).toBeOnTheScreen();
    expect(picker.pickImages).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('media-permission')).toBeNull();
  });

  it('names why an image cannot be attached and attaches the others', async () => {
    const gif = pickedImage({ uri: 'file:///cache/party.gif', mimeType: 'image/gif', fileName: 'party.gif' });
    const huge = pickedImage({ uri: 'file:///cache/huge.jpg', fileSize: MAX_SOURCE_BYTES + 1 });
    const broken = pickedImage({ uri: 'file:///cache/broken.jpg', width: 0 });
    const launched = await launch('/trips/trip-1/photos', {
      configure: ({ permissions, picker }) => {
        permissions.allow('library');
        picker.result = ok([first, gif, huge, broken]);
      },
    });
    const { user } = launched;

    await user.press(await button('Add photo'));
    await user.press(await button('Choose from library'));

    await screen.findByTestId('photo-preview');
    expect(within(screen.getByTestId('preview-item-1')).getByText(/not supported|isn't supported/i)).toBeOnTheScreen();
    expect(within(screen.getByTestId('preview-item-2')).getByText(/50 MB/)).toBeOnTheScreen();
    expect(within(screen.getByTestId('preview-item-3')).getByText(/can't be read|couldn't be read/i)).toBeOnTheScreen();
    expect(within(screen.getByTestId('preview-item-0')).queryByText(/supported|50 MB|be read/i)).toBeNull();

    await user.press(await button(/^Attach/));

    await screen.findByTestId('photo-gallery');
    await waitFor(async () => expect(await savedPhotos(launched)).toHaveLength(1));
  });

  it('lets one image be removed from the preview before attaching', async () => {
    const launched = await launch('/trips/trip-1/photos', {
      configure: ({ permissions, picker }) => {
        permissions.allow('library');
        picker.result = ok([first, second]);
      },
    });
    const { user, files } = launched;
    await user.press(await button('Add photo'));
    await user.press(await button('Choose from library'));
    await screen.findByTestId('photo-preview');

    await user.press(within(screen.getByTestId('preview-item-0')).getByRole('button', { name: /Remove/ }));
    await waitFor(() => expect(screen.getAllByTestId(/^preview-item-/)).toHaveLength(1));
    await user.press(await button(/^Attach/));

    await screen.findByTestId('photo-gallery');
    await waitFor(async () => expect(await savedPhotos(launched)).toHaveLength(1));
    expect(files.imported).toHaveLength(1);
  });

  it('saves nothing when the preview is discarded', async () => {
    const launched = await launch('/trips/trip-1/photos', {
      configure: ({ permissions, picker }) => {
        permissions.allow('library');
        picker.result = ok([first]);
      },
    });
    const { user, files } = launched;
    await user.press(await button('Add photo'));
    await user.press(await button('Choose from library'));
    await screen.findByTestId('photo-preview');

    await user.press(await button('Discard'));

    expect(await screen.findByTestId('photo-gallery')).toBeOnTheScreen();
    expect(await savedPhotos(launched)).toEqual([]);
    expect(files.imported).toEqual([]);
  });

  it('stays in the gallery when the picker is cancelled', async () => {
    const { user, picker } = await launch('/trips/trip-1/photos', {
      configure: ({ permissions }) => permissions.allow('library'),
    });

    await user.press(await button('Add photo'));
    await user.press(await button('Choose from library'));

    await waitFor(() => expect(picker.pickImages).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('photo-preview')).toBeNull();
    expect(screen.getByTestId('photo-gallery')).toBeOnTheScreen();
  });

  it('shows a storage error and leaves nothing behind when copying fails', async () => {
    const launched = await launch('/trips/trip-1/photos', {
      configure: ({ permissions, picker, files }) => {
        permissions.allow('library');
        picker.result = ok([first, second]);
        files.failImportAt = 2;
      },
    });
    const { user, files } = launched;
    await user.press(await button('Add photo'));
    await user.press(await button('Choose from library'));
    await screen.findByTestId('photo-preview');

    await user.press(await button(/^Attach/));

    expect(await screen.findByText(STORAGE_ERROR)).toBeOnTheScreen();
    expect(await savedPhotos(launched)).toEqual([]);
    expect(files.files.size).toBe(0);
  });

  it('attaches once when Attach is tapped twice', async () => {
    const launched = await launch('/trips/trip-1/photos', {
      configure: ({ permissions, picker }) => {
        permissions.allow('library');
        picker.result = ok([first]);
      },
    });
    const { user } = launched;
    await user.press(await button('Add photo'));
    await user.press(await button('Choose from library'));

    const attach = await button(/^Attach/);
    fireEvent.press(attach);
    fireEvent.press(attach);

    await screen.findByTestId('photo-gallery');
    await waitFor(async () => expect(await savedPhotos(launched)).toHaveLength(1));
  });

  it('says there is nothing to preview when opened without a selection', async () => {
    await launch('/trips/trip-1/photos/preview');

    expect(await screen.findByText('Nothing to preview')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Attach/ })).toBeNull();
    expect(await button(/back/i)).toBeOnTheScreen();
  });
});

describe('Photo library permission', () => {
  it('explains first and asks the system only when Allow is tapped, then opens the picker', async () => {
    const { user, permissions, picker } = await launch('/trips/trip-1/photos', {
      configure: ({ picker: fake }) => (fake.result = ok([pickedImage()])),
    });

    await user.press(await button('Add photo'));
    await user.press(await button('Choose from library'));

    expect(await screen.findByTestId('media-permission')).toBeOnTheScreen();
    expect(permissions.requestPermission).not.toHaveBeenCalled();
    expect(picker.pickImages).not.toHaveBeenCalled();

    await user.press(await button('Allow'));

    expect(await screen.findByTestId('photo-preview')).toBeOnTheScreen();
    expect(permissions.requestPermission).toHaveBeenCalledTimes(1);
    expect(permissions.requestPermission).toHaveBeenCalledWith('library');
    expect(picker.pickImages).toHaveBeenCalledTimes(1);
  });

  it('offers Allow again after the traveller declined but can still be asked', async () => {
    const { user, picker } = await launch('/trips/trip-1/photos', {
      configure: ({ permissions }) => (permissions.permissions.library = 'denied'),
    });

    await user.press(await button('Add photo'));
    await user.press(await button('Choose from library'));

    expect(await screen.findByTestId('media-permission')).toBeOnTheScreen();
    expect(await button('Allow')).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Open Settings' })).toBeNull();
    expect(picker.pickImages).not.toHaveBeenCalled();
  });

  it('points to Settings when access is turned off, and never opens the picker', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    const { user, picker, permissions } = await launch('/trips/trip-1/photos', {
      configure: ({ permissions: fake }) => (fake.permissions.library = 'blocked'),
    });

    await user.press(await button('Add photo'));
    await user.press(await button('Choose from library'));

    const explanation = await screen.findByTestId('media-permission');
    expect(within(explanation).getByText(/access is turned off/i)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull();
    await user.press(await button('Open Settings'));

    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(permissions.requestPermission).not.toHaveBeenCalled();
    expect(picker.pickImages).not.toHaveBeenCalled();
  });
});

describe('Camera', () => {
  it('takes a photo for an activity, which then shows in its gallery, its details and the trip gallery', async () => {
    const launched = await launch('/trips/trip-1/itinerary/act-1/photos', {
      configure: ({ permissions }) => permissions.allow('camera'),
    });
    const { user } = launched;

    await screen.findByTestId('photo-gallery');
    await user.press(await button('Add photo'));
    await user.press(await button('Take photo'));
    expect(await screen.findByTestId('camera-view')).toBeOnTheScreen();
    await user.press(await button('Take picture'));

    const preview = await screen.findByTestId('photo-preview');
    expect(within(preview).getAllByTestId(/^preview-item-/)).toHaveLength(1);
    expect(showsImage(screen.getByTestId('preview-item-0'), 'file:///cache/Camera/capture.jpg')).toBe(true);
    expect(mockCamera.takePictureAsync).toHaveBeenCalledWith(expect.objectContaining({ exif: true }));

    await user.press(await button(/^Attach/));

    expect(await screen.findByTestId('photo-gallery')).toBeOnTheScreen();
    await waitFor(() => expect(tiles()).toHaveLength(1));
    const saved = await savedPhotos(launched);
    expect(saved).toEqual([
      expect.objectContaining({
        tripId: 'trip-1',
        activityId: 'act-1',
        source: 'camera',
        width: 2048,
        height: 1536,
        takenAt: CAPTURED_AT,
      }),
    ]);
    const id = saved[0]?.id ?? '';

    await navigate('/trips/trip-1/itinerary/act-1');
    const section = await screen.findByTestId('activity-photos');
    expect(within(section).getByTestId(`photo-tile-${id}`)).toBeOnTheScreen();

    await navigate('/trips/trip-1/photos');
    await waitFor(() => expect(screen.getByTestId(`photo-tile-${id}`)).toBeOnTheScreen());
    expect(within(screen.getByTestId(`photo-tile-${id}`)).getByText('Belém Tower')).toBeOnTheScreen();
  });

  it('explains first and asks the system only when Allow is tapped, then shows the camera', async () => {
    const { user, permissions } = await launch('/trips/trip-1/photos');

    await user.press(await button('Add photo'));
    await user.press(await button('Take photo'));

    expect(await screen.findByTestId('media-permission')).toBeOnTheScreen();
    expect(screen.queryByTestId('camera-view')).toBeNull();
    expect(permissions.requestPermission).not.toHaveBeenCalled();

    await user.press(await button('Allow'));

    expect(await screen.findByTestId('camera-view')).toBeOnTheScreen();
    expect(permissions.requestPermission).toHaveBeenCalledTimes(1);
    expect(permissions.requestPermission).toHaveBeenCalledWith('camera');
  });

  it('keeps the camera closed and offers Allow again when the traveller declines', async () => {
    const { user } = await launch('/trips/trip-1/photos', {
      configure: ({ permissions }) => (permissions.answerPromptWith.camera = 'denied'),
    });

    await user.press(await button('Add photo'));
    await user.press(await button('Take photo'));
    await user.press(await button('Allow'));

    await waitFor(() => expect(screen.getByTestId('media-permission')).toBeOnTheScreen());
    expect(await button('Allow')).toBeEnabled();
    expect(screen.queryByTestId('camera-view')).toBeNull();
  });

  it('points to Settings when camera access is turned off, and never shows the camera', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    const { user, permissions } = await launch('/trips/trip-1/photos/camera', {
      configure: ({ permissions: fake }) => (fake.permissions.camera = 'blocked'),
    });

    const explanation = await screen.findByTestId('media-permission');
    expect(within(explanation).getByText(/access is turned off/i)).toBeOnTheScreen();
    await user.press(await button('Open Settings'));

    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(permissions.requestPermission).not.toHaveBeenCalled();
    expect(screen.queryByTestId('camera-view')).toBeNull();
    expect(mockCamera.takePictureAsync).not.toHaveBeenCalled();
  });

  it("says the camera isn't available when it fails to start, with a way back", async () => {
    await launch('/trips/trip-1/photos/camera', { configure: ({ permissions }) => permissions.allow('camera') });

    const camera = await screen.findByTestId('camera-view');
    await act(async () => fireEvent(camera, 'mountError', { message: 'Camera is not available on this device' }));

    expect(await screen.findByText("Camera isn't available")).toBeOnTheScreen();
    expect(await button(/back/i)).toBeOnTheScreen();
    expect(screen.queryByTestId('camera-view')).toBeNull();
  });
});

describe('Photo viewer', () => {
  it('shows the photo with its details', async () => {
    await launch('/trips/trip-1/photos/beach', { photos: [tripPhoto] });

    const viewer = await screen.findByTestId('photo-viewer');
    expect(showsImage(viewer, 'file:///documents/trip-photos/beach.jpg')).toBe(true);
    expect(within(viewer).getByText(/2048\s*[×x]\s*1536/)).toBeOnTheScreen();
  });

  it('deletes a photo only after confirmation, and it leaves both galleries', async () => {
    const launched = await launch('/trips/trip-1/photos', { photos: [tripPhoto, activityPhoto] });
    const { user, files } = launched;

    await user.press(await screen.findByTestId('photo-tile-tower'));
    await screen.findByTestId('photo-viewer');
    await user.press(await button('Delete photo'));
    expect(await screen.findByText('Delete this photo?')).toBeOnTheScreen();
    await user.press(await button('Keep photo'));
    expect(await savedPhotos(launched)).toHaveLength(2);

    await user.press(await button('Delete photo'));
    await user.press(await button('Delete'));

    expect(await screen.findByTestId('photo-gallery')).toBeOnTheScreen();
    await waitFor(() => expect(tiles().map((node) => node.props.testID)).toEqual(['photo-tile-beach']));
    expect((await savedPhotos(launched)).map(({ id }) => id)).toEqual(['beach']);
    expect(files.removed).toEqual(['trip-photos/tower.jpg']);

    await navigate('/trips/trip-1/itinerary/act-1/photos');
    expect(await screen.findByTestId('photo-gallery-empty')).toBeOnTheScreen();
  });

  it('keeps the photo and shows the storage error when the delete fails', async () => {
    const launched = await launch('/trips/trip-1/photos/beach', { photos: [tripPhoto] });
    const { user, dependencies, files } = launched;
    jest.spyOn(dependencies.photoRepository, 'delete').mockResolvedValueOnce(err(new AppError('storage', 'disk full')));

    await screen.findByTestId('photo-viewer');
    await user.press(await button('Delete photo'));
    await user.press(await button('Delete'));

    expect(await screen.findByText(STORAGE_ERROR)).toBeOnTheScreen();
    expect(screen.getByTestId('photo-viewer')).toBeOnTheScreen();
    expect(await savedPhotos(launched)).toHaveLength(1);
    expect(files.removed).toEqual([]);
  });

  it('sets a trip photo as the cover, which the trip shows and keeps after the photo is deleted', async () => {
    const launched = await launch('/trips/trip-1/photos/beach', { photos: [tripPhoto] });
    const { user, covers } = launched;

    await screen.findByTestId('photo-viewer');
    await user.press(await button('Set as cover'));

    await waitFor(async () => expect(await tripCover(launched)).toBe('trip-covers/cover-1.jpg'));
    await navigate('/trips/trip-1');
    expect(await screen.findByLabelText('Cover photo for Lisbon getaway')).toBeOnTheScreen();

    await navigate('/trips/trip-1/photos/beach');
    await user.press(await button('Delete photo'));
    await user.press(await button('Delete'));

    await waitFor(async () => expect(await savedPhotos(launched)).toEqual([]));
    expect(await tripCover(launched)).toBe('trip-covers/cover-1.jpg');
    expect(covers.removed).toEqual([]);
  });

  it('shows an unavailable photo that can still be deleted', async () => {
    const launched = await launch('/trips/trip-1/photos/beach', {
      photos: [tripPhoto],
      configure: ({ files }) => files.missing.add('trip-photos/beach.jpg'),
    });
    const { user } = launched;

    const viewer = await screen.findByTestId('photo-viewer');
    expect(within(viewer).getByText('Photo unavailable')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Set as cover' })).toBeNull();

    await user.press(await button('Delete photo'));
    await user.press(await button('Delete'));

    await waitFor(async () => expect(await savedPhotos(launched)).toEqual([]));
  });

  it('says when the photo does not exist', async () => {
    await launch('/trips/trip-1/photos/gone');
    expect((await screen.findAllByText(/not found/i)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Delete photo' })).toBeNull();
  });
});
