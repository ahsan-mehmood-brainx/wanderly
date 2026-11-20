import { userEvent } from '@testing-library/react-native';
import { router, Stack } from 'expo-router';
import { type DrawerContentComponentProps } from 'expo-router/drawer';
import { act, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import EditProfileRoute from '@/app/(app)/(tabs)/profile/edit';
import ProfileRoute from '@/app/(app)/(tabs)/profile/index';
import { AppProviders } from '@/bootstrap/AppProviders';
import { type AppDependencies } from '@/core/di/AppDependencies';
import { AppError } from '@/core/errors/AppError';
import { createI18n } from '@/core/i18n/createI18n';
import { err, ok } from '@/core/result';
import { restoreSession } from '@/features/auth/presentation/state/authSlice';
import { type Favorite } from '@/features/favorites/domain/Favorite';
import { DEFAULT_PREFERENCES } from '@/features/preferences/domain/Preferences';
import { AppDrawerContent } from '@/features/shell/presentation/components/AppDrawerContent';
import { type StoredTrip } from '@/features/trips/domain/Trip';
import { InMemorySessionRepository, loginResponseDto, stubDummyJson, testSession } from '@/testing/authFixtures';
import { apiSuccess, FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { createTestStore } from '@/testing/createTestStore';
import { favorite, seededFavoritesDatabase } from '@/testing/favoritesFixtures';
import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { ManualClock } from '@/testing/ManualClock';
import { MockPreferencesRepository } from '@/testing/MockPreferencesRepository';
import { FakeProfilePhotoStore, localProfile } from '@/testing/profileFixtures';
import { createTestDependencies } from '@/testing/testDependencies';
import { FakeImagePickerService, storedTrip, TRIP_OWNER, TRIPS_NOW } from '@/testing/tripFixtures';

import { EMPTY_LOCAL_PROFILE, type LocalProfile } from '../../domain/LocalProfile';

const PROFILE_KEY = `profile.local.v1.${TRIP_OWNER}`;

const drawerNavigation = { closeDrawer: jest.fn() } as unknown as DrawerContentComponentProps['navigation'];

function DrawerRoute() {
  return <AppDrawerContent {...({ navigation: drawerNavigation } as DrawerContentComponentProps)} />;
}

interface LaunchOptions {
  readonly initialUrl?: string;
  readonly trips?: readonly StoredTrip[];
  readonly favorites?: readonly Favorite[];
  readonly profile?: LocalProfile;
  readonly overrides?: Partial<AppDependencies>;
}

async function launch({
  initialUrl = '/profile',
  trips = [],
  favorites = [],
  profile,
  overrides = {},
}: LaunchOptions = {}) {
  const storage = await seededFavoritesDatabase({ favorites });
  for (const trip of trips) {
    const inserted = await storage.repository.insert(TRIP_OWNER, trip);
    if (!inserted.ok) throw inserted.error;
  }
  const keyValueStore = new InMemoryKeyValueStore(profile ? { [PROFILE_KEY]: JSON.stringify(profile) } : {});
  const httpClientFactory = new FakeHttpClientFactory();
  stubDummyJson(httpClientFactory).authorizedApi.on('GET', '/auth/me', apiSuccess(loginResponseDto()));
  const photos = new FakeProfilePhotoStore();
  const picker = new FakeImagePickerService();
  const dependencies = createTestDependencies({
    database: storage.database,
    keyValueStore,
    httpClientFactory,
    clock: new ManualClock(TRIPS_NOW),
    sessionRepository: new InMemorySessionRepository(testSession()),
    profilePhotoStore: photos,
    imagePickerService: picker,
    ...overrides,
  });
  const store = createTestStore(dependencies);
  await store.dispatch(restoreSession());
  const container = { dependencies, store, i18n: createI18n('en') };

  await renderRouter(
    {
      _layout: () => (
        <AppProviders container={container}>
          <Stack screenOptions={{ headerShown: false }} />
        </AppProviders>
      ),
      'profile/index': ProfileRoute,
      'profile/edit': EditProfileRoute,
      drawer: DrawerRoute,
    },
    { initialUrl },
  );
  return { keyValueStore, photos, picker, dependencies, store, user: userEvent.setup() };
}

const button = (name: string | RegExp) => screen.findByRole('button', { name });
const stat = (id: 'totalTrips' | 'completedTrips' | 'savedPlaces') => screen.findByTestId(`profile-stat-${id}`);
const renderedTree = () => JSON.stringify(screen.toJSON());

function storedProfile(keyValueStore: InMemoryKeyValueStore): LocalProfile | null {
  const raw = keyValueStore.data.get(PROFILE_KEY);
  return raw ? (JSON.parse(raw) as LocalProfile) : null;
}

// Full flows over SQLite with typed input are slower than unit tests.
jest.setTimeout(20_000);

describe('Profile', () => {
  it('TC-08 shows the account details and offers to edit the profile', async () => {
    await launch();

    expect(await screen.findByText('Emily Johnson')).toBeOnTheScreen();
    expect(screen.getByText('emily.johnson@x.dummyjson.com')).toBeOnTheScreen();
    expect(screen.getByText('emilys')).toBeOnTheScreen();
    expect(renderedTree()).toContain('https://dummyjson.com/icon/emilys/128');
    expect(await button('Edit profile')).toBeOnTheScreen();
  });

  it('TC-08 counts total trips without cancelled ones, completed trips and saved places', async () => {
    await launch({
      trips: [
        storedTrip({ id: 'past', title: 'Past', startDate: '2027-01-01', endDate: '2027-01-05' }),
        storedTrip({ id: 'now', title: 'Now', startDate: '2027-06-10', endDate: '2027-06-20' }),
        storedTrip({ id: 'next', title: 'Next', startDate: '2027-07-01', endDate: '2027-07-02' }),
        storedTrip({ id: 'off', title: 'Off', startDate: '2027-08-01', endDate: '2027-08-02', cancelledAt: 1 }),
      ],
      favorites: [favorite({ id: 'a' }), favorite({ id: 'b', targetId: 'porto', name: 'Porto' })],
    });

    const total = await stat('totalTrips');
    await waitFor(() => expect(within(total).getByText('3')).toBeOnTheScreen());
    expect(within(total).getByText('Total trips')).toBeOnTheScreen();
    expect(within(await stat('completedTrips')).getByText('1')).toBeOnTheScreen();
    expect(within(await stat('completedTrips')).getByText('Completed trips')).toBeOnTheScreen();
    await waitFor(async () => expect(within(await stat('savedPlaces')).getByText('2')).toBeOnTheScreen());
    expect(within(await stat('savedPlaces')).getByText('Saved places')).toBeOnTheScreen();
  });

  it('TC-08 shows a dash for trip stats that cannot load and keeps the rest of the screen', async () => {
    const getTrips = { execute: jest.fn().mockResolvedValue(err(new AppError('storage', 'locked'))) };
    await launch({ favorites: [favorite({ id: 'a' })], overrides: { getTrips } });

    await waitFor(async () => expect(within(await stat('totalTrips')).getByText('—')).toBeOnTheScreen());
    expect(within(await stat('completedTrips')).getByText('—')).toBeOnTheScreen();
    await waitFor(async () => expect(within(await stat('savedPlaces')).getByText('1')).toBeOnTheScreen());
    expect(screen.getByText('Emily Johnson')).toBeOnTheScreen();
    expect(screen.getByText('emily.johnson@x.dummyjson.com')).toBeOnTheScreen();
  });

  it('TC-08 prefers the local name and photo over the account ones', async () => {
    await launch({
      profile: localProfile({ displayName: 'Em the Explorer', photo: 'profile-photos/me.jpg', updatedAt: TRIPS_NOW }),
    });

    expect(await screen.findByText('Em the Explorer')).toBeOnTheScreen();
    expect(screen.getByText('emily.johnson@x.dummyjson.com')).toBeOnTheScreen();
    expect(renderedTree()).toContain('file:///documents/profile-photos/me.jpg');
  });

  it('TC-08 shows the local name and photo in the drawer', async () => {
    await launch({
      initialUrl: '/drawer',
      profile: localProfile({ displayName: 'Em the Explorer', photo: 'profile-photos/me.jpg', updatedAt: TRIPS_NOW }),
    });

    expect(await screen.findByText('Em the Explorer')).toBeOnTheScreen();
    expect(screen.queryByText('Emily Johnson')).not.toBeOnTheScreen();
    expect(renderedTree()).toContain('file:///documents/profile-photos/me.jpg');
  });

  it('TC-08 says when the local profile cannot load and loads it again on request', async () => {
    const localProfileRepository = {
      load: jest
        .fn()
        .mockResolvedValueOnce(err(new AppError('storage', 'locked')))
        .mockResolvedValue(ok(localProfile({ displayName: 'Em the Explorer', updatedAt: TRIPS_NOW }))),
      save: jest.fn(),
    };
    const { user } = await launch({ overrides: { localProfileRepository } });

    expect(await screen.findByText(/couldn't load your profile details/)).toBeOnTheScreen();
    expect(screen.getByText('Emily Johnson')).toBeOnTheScreen();

    await user.press(await button('Try again'));

    expect(await screen.findByText('Em the Explorer')).toBeOnTheScreen();
    expect(screen.queryByText(/couldn't load your profile details/)).not.toBeOnTheScreen();
  });

  it('TC-04 renders the profile through translations', async () => {
    await launch({
      overrides: { preferencesRepository: new MockPreferencesRepository({ ...DEFAULT_PREFERENCES, language: 'es' }) },
    });

    expect(await stat('totalTrips')).toBeOnTheScreen();
    for (const english of ['Total trips', 'Completed trips', 'Saved places', 'Edit profile']) {
      expect(screen.queryByText(english)).not.toBeOnTheScreen();
    }
  });
});

describe('Edit profile', () => {
  async function openEditor(options: LaunchOptions = {}) {
    const launched = await launch(options);
    await launched.user.press(await button('Edit profile'));
    await screen.findByLabelText('Display name');
    return launched;
  }

  it('TC-09 saves the local profile for this account and shows it on Profile', async () => {
    const { user, keyValueStore } = await openEditor();

    const name = screen.getByLabelText('Display name');
    await user.clear(name);
    await user.type(name, '  Em the Explorer ');
    await user.type(screen.getByLabelText('Home base'), 'Lahore');
    await user.type(screen.getByLabelText('Bio'), 'Slow travel fan');
    await user.press(await button(/^Save/));

    expect(await screen.findByText('Em the Explorer')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Display name')).not.toBeOnTheScreen();
    expect(storedProfile(keyValueStore)).toEqual({
      displayName: 'Em the Explorer',
      homeBase: 'Lahore',
      bio: 'Slow travel fan',
      photo: null,
      updatedAt: TRIPS_NOW,
    });
  });

  it('TC-09 shows an inline error for a display name over 60 characters and saves nothing', async () => {
    const { user, keyValueStore } = await openEditor();

    const name = screen.getByLabelText('Display name');
    await user.clear(name);
    await user.type(name, 'a'.repeat(61));
    await user.press(await button(/^Save/));

    await waitFor(() => expect(screen.getByLabelText('Display name').props.accessibilityHint).toMatch(/60/));
    expect(storedProfile(keyValueStore)).toBeNull();
  });

  it('TC-09 requires a display name', async () => {
    const { user, keyValueStore } = await openEditor();
    const hintBefore: unknown = screen.getByLabelText('Display name').props.accessibilityHint;

    await user.clear(screen.getByLabelText('Display name'));
    await user.press(await button(/^Save/));

    await waitFor(() => expect(screen.getByLabelText('Display name').props.accessibilityHint).not.toEqual(hintBefore));
    expect(screen.getByLabelText('Display name').props.accessibilityHint).toBeTruthy();
    expect(storedProfile(keyValueStore)).toBeNull();
  });

  it('TC-09 limits the bio to 160 characters', async () => {
    const { user, keyValueStore } = await openEditor();

    await user.type(screen.getByLabelText('Bio'), 'b'.repeat(161));
    await user.press(await button(/^Save/));

    await waitFor(() => expect(screen.getByLabelText('Bio').props.accessibilityHint).toMatch(/160/));
    expect(storedProfile(keyValueStore)).toBeNull();
  });

  it('TC-09 explains a storage failure and keeps what was typed', async () => {
    const localProfileRepository = {
      load: jest.fn().mockResolvedValue(ok(EMPTY_LOCAL_PROFILE)),
      save: jest.fn().mockResolvedValue(err(new AppError('storage', 'disk full'))),
    };
    const { user } = await openEditor({ overrides: { localProfileRepository } });

    const name = screen.getByLabelText('Display name');
    await user.clear(name);
    await user.type(name, 'Em the Explorer');
    await user.press(await button(/^Save/));

    expect(await screen.findByText("We couldn't access data saved on this device.")).toBeOnTheScreen();
    expect(screen.getByLabelText('Display name').props.value).toBe('Em the Explorer');
  });

  it('TC-09 keeps following the account name when only other details change', async () => {
    const { user, keyValueStore } = await openEditor();

    expect(screen.getByLabelText('Display name').props.value).toBe('Emily Johnson');
    await user.type(screen.getByLabelText('Bio'), 'Slow travel fan');
    await user.press(await button(/^Save/));

    await waitFor(() => expect(screen.queryByLabelText('Display name')).not.toBeOnTheScreen());
    expect(storedProfile(keyValueStore)).toEqual({
      displayName: null,
      homeBase: null,
      bio: 'Slow travel fan',
      photo: null,
      updatedAt: TRIPS_NOW,
    });
    expect(screen.getByText('Emily Johnson')).toBeOnTheScreen();
  });

  it('TC-09 asks before discarding unsaved changes', async () => {
    const { user, keyValueStore } = await openEditor();
    const name = screen.getByLabelText('Display name');
    await user.clear(name);
    await user.type(name, 'Draft name');

    await act(async () => router.back());
    await user.press(await button('Keep editing'));
    expect(screen.getByLabelText('Display name').props.value).toBe('Draft name');

    await act(async () => router.back());
    await user.press(await button('Discard'));

    expect(await button('Edit profile')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Display name')).not.toBeOnTheScreen();
    expect(storedProfile(keyValueStore)).toBeNull();
  });

  it('TC-09 copies a chosen photo into app storage on save and shows it on Profile', async () => {
    const { user, picker, photos, keyValueStore } = await openEditor();
    picker.result = ok('file:///picked/me.jpg');

    await user.press(await button(/photo/i));
    await waitFor(() => expect(picker.pickImage).toHaveBeenCalledWith({ aspect: [1, 1] }));
    expect(photos.stored.size).toBe(0);
    await user.press(await button(/^Save/));

    await waitFor(() => expect(storedProfile(keyValueStore)?.photo).toBe('profile-photos/photo-1.jpg'));
    expect([...photos.stored]).toEqual(['profile-photos/photo-1.jpg']);
    expect(await button('Edit profile')).toBeOnTheScreen();
    expect(renderedTree()).toContain('file:///documents/profile-photos/photo-1.jpg');
  });

  it('TC-04 labels the photo control for screen readers', async () => {
    await openEditor();

    const photoButtons = screen.getAllByRole('button', { name: /photo/i });
    expect(photoButtons.length).toBeGreaterThan(0);
  });
});
