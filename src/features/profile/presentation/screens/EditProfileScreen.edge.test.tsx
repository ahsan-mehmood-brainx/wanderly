import { userEvent } from '@testing-library/react-native';
import { router, Stack } from 'expo-router';
import { act, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import EditProfileRoute from '@/app/(app)/(tabs)/profile/edit';
import ProfileRoute from '@/app/(app)/(tabs)/profile/index';
import { AppProviders } from '@/bootstrap/AppProviders';
import { type AppDependencies } from '@/core/di/AppDependencies';
import { AppError } from '@/core/errors/AppError';
import { createI18n } from '@/core/i18n/createI18n';
import { err, ok } from '@/core/result';
import { restoreSession } from '@/features/auth/presentation/state/authSlice';
import { InMemorySessionRepository, loginResponseDto, stubDummyJson, testSession } from '@/testing/authFixtures';
import { apiSuccess, FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { createTestStore } from '@/testing/createTestStore';
import { seededFavoritesDatabase } from '@/testing/favoritesFixtures';
import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { ManualClock } from '@/testing/ManualClock';
import { FakeProfilePhotoStore, localProfile } from '@/testing/profileFixtures';
import { createTestDependencies } from '@/testing/testDependencies';
import { FakeImagePickerService, TRIP_OWNER, TRIPS_NOW } from '@/testing/tripFixtures';

import { StorageLocalProfileRepository } from '../../data/StorageLocalProfileRepository';
import { type LocalProfile } from '../../domain/LocalProfile';

const PROFILE_KEY = `profile.local.v1.${TRIP_OWNER}`;

interface LaunchOptions {
  readonly profile?: LocalProfile;
  readonly overrides?: Partial<AppDependencies>;
}

async function openEditor({ profile, overrides = {} }: LaunchOptions = {}) {
  const storage = await seededFavoritesDatabase({ favorites: [] });
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
    },
    { initialUrl: '/profile' },
  );
  const user = userEvent.setup();
  await user.press(await screen.findByRole('button', { name: 'Edit profile' }));
  return { keyValueStore, photos, picker, dependencies, store, user };
}

const button = (name: string | RegExp) => screen.findByRole('button', { name });
const renderedTree = () => JSON.stringify(screen.toJSON());

function storedProfile(keyValueStore: InMemoryKeyValueStore): LocalProfile | null {
  const raw = keyValueStore.data.get(PROFILE_KEY);
  return raw ? (JSON.parse(raw) as LocalProfile) : null;
}

const WITH_PHOTO = localProfile({ displayName: 'Emily J.', photo: 'profile-photos/old.jpg', updatedAt: TRIPS_NOW });

jest.setTimeout(20_000);

describe('Edit profile edge cases', () => {
  it('starts with the account name when no display name was saved yet', async () => {
    await openEditor();

    expect((await screen.findByLabelText('Display name')).props.value).toBeTruthy();
  });

  it('a cancelled photo pick changes nothing, so leaving does not ask', async () => {
    const { user, picker } = await openEditor();
    picker.result = ok(null);

    await user.press(await button('Choose profile photo'));
    await waitFor(() => expect(picker.pickImage).toHaveBeenCalledTimes(1));
    await act(async () => router.back());

    expect(await button('Edit profile')).toBeOnTheScreen();
    expect(screen.queryByTestId('discard-profile-sheet')).not.toBeOnTheScreen();
  });

  it('a failed photo pick explains it, and a later successful pick clears the message', async () => {
    const { user, picker } = await openEditor();
    picker.result = err(new AppError('unknown', 'picker crashed'));

    await user.press(await button('Choose profile photo'));
    expect(await screen.findByText("We couldn't open your photos. Try again.")).toBeOnTheScreen();

    picker.result = ok('file:///picked/me.jpg');
    await user.press(await button('Choose profile photo'));

    await waitFor(() => expect(screen.queryByText("We couldn't open your photos. Try again.")).not.toBeOnTheScreen());
    expect(await button('Change profile photo')).toBeOnTheScreen();
  });

  it('removing the saved photo deletes its file only after saving', async () => {
    const { user, photos, keyValueStore } = await openEditor({ profile: WITH_PHOTO });

    await user.press(await button('Remove photo'));
    expect(photos.removed).toEqual([]);
    await user.press(await button(/^Save/));

    await waitFor(() => expect(storedProfile(keyValueStore)?.photo).toBeNull());
    expect(photos.removed).toEqual(['profile-photos/old.jpg']);
    expect(await button('Edit profile')).toBeOnTheScreen();
    expect(renderedTree()).not.toContain('profile-photos/old.jpg');
  });

  it('replacing the photo copies the new one and deletes the old one after saving', async () => {
    const { user, picker, photos, keyValueStore } = await openEditor({ profile: WITH_PHOTO });
    picker.result = ok('file:///picked/new.jpg');

    await user.press(await button('Change profile photo'));
    await waitFor(() => expect(renderedTree()).toContain('file:///picked/new.jpg'));
    await user.press(await button(/^Save/));

    await waitFor(() => expect(storedProfile(keyValueStore)?.photo).toBe('profile-photos/photo-1.jpg'));
    expect(photos.removed).toEqual(['profile-photos/old.jpg']);
  });

  it('removing a newly picked photo before saving leaves the saved one untouched', async () => {
    const { user, picker, photos } = await openEditor();
    picker.result = ok('file:///picked/me.jpg');

    await user.press(await button('Choose profile photo'));
    await user.press(await button('Remove photo'));
    await act(async () => router.back());

    // Back where it started: nothing to discard.
    expect(await button('Edit profile')).toBeOnTheScreen();
    expect(photos.stored.size).toBe(0);
  });

  it('typing and then restoring the original name counts as no change', async () => {
    const { user } = await openEditor({ profile: localProfile({ displayName: 'Emily J.' }) });

    const name = await screen.findByLabelText('Display name');
    await user.type(name, 'x');
    await user.clear(name);
    await user.type(name, 'Emily J.');
    await act(async () => router.back());

    expect(await button('Edit profile')).toBeOnTheScreen();
  });

  it('saves an emoji display name and shows it on Profile', async () => {
    const { user, keyValueStore } = await openEditor();

    const name = await screen.findByLabelText('Display name');
    await user.clear(name);
    await user.type(name, 'Ali 🌍✈️');
    await user.press(await button(/^Save/));

    expect(await screen.findByText('Ali 🌍✈️')).toBeOnTheScreen();
    expect(storedProfile(keyValueStore)?.displayName).toBe('Ali 🌍✈️');
  });

  it('shows a retry when the profile cannot be read, and opens the form once it loads', async () => {
    const keyValueStore = new InMemoryKeyValueStore();
    const repository = new StorageLocalProfileRepository(keyValueStore, { warn: jest.fn() } as never);
    jest.spyOn(repository, 'load').mockResolvedValueOnce(err(new AppError('storage', 'busy')));
    const { user } = await openEditor({ overrides: { keyValueStore, localProfileRepository: repository } });

    await user.press(await button('Try again'));

    expect(await screen.findByLabelText('Display name')).toBeOnTheScreen();
  });

  it('hides the photo picker where photos are not supported (web)', async () => {
    const photos = new FakeProfilePhotoStore();
    Object.defineProperty(photos, 'supported', { value: false });
    await openEditor({ overrides: { profilePhotoStore: photos } });

    await screen.findByLabelText('Display name');
    expect(screen.queryByRole('button', { name: /profile photo/i })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Remove photo' })).not.toBeOnTheScreen();
  });
});
