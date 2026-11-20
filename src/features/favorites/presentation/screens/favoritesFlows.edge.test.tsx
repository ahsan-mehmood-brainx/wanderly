import { userEvent } from '@testing-library/react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { Text } from 'react-native';

import CollectionRoute from '@/app/(app)/saved/collections/[collectionId]';
import SavedPlacesRoute from '@/app/(app)/saved/index';
import { AppProviders } from '@/bootstrap/AppProviders';
import { createI18n } from '@/core/i18n/createI18n';
import { type Collection, type CollectionMembership } from '@/features/favorites/domain/Collection';
import { type Favorite } from '@/features/favorites/domain/Favorite';
import { createTestStore } from '@/testing/createTestStore';
import {
  customCollection,
  favorite,
  FAVORITES_NOW,
  restaurantFavorite,
  seededFavoritesDatabase,
} from '@/testing/favoritesFixtures';
import { FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { ManualClock } from '@/testing/ManualClock';
import { createTestDependencies } from '@/testing/testDependencies';
import { TRIP_OWNER } from '@/testing/tripFixtures';

const lisbon = favorite({ id: 'lisbon-fav', savedAt: FAVORITES_NOW });
const julesVerne = restaurantFavorite({ id: 'jules-verne', savedAt: FAVORITES_NOW + 1_000 });
const food = customCollection({ id: 'food', name: 'Lisbon food' });

interface LaunchOptions {
  readonly favorites?: readonly Favorite[];
  readonly collections?: readonly Collection[];
  readonly memberships?: readonly Pick<CollectionMembership, 'collectionId' | 'favoriteId'>[];
  readonly initialUrl?: string;
}

function DestinationStub() {
  const { destinationId } = useLocalSearchParams<{ destinationId: string }>();
  return <Text>{`Destination ${destinationId}`}</Text>;
}

async function launch({ favorites = [], collections = [], memberships = [], initialUrl = '/saved' }: LaunchOptions) {
  const storage = await seededFavoritesDatabase({ favorites, collections, memberships });
  const dependencies = createTestDependencies({
    database: storage.database,
    clock: new ManualClock(FAVORITES_NOW + 60_000),
    httpClientFactory: new FakeHttpClientFactory(),
  });
  const container = { dependencies, store: createTestStore(dependencies), i18n: createI18n('en') };
  await renderRouter(
    {
      _layout: () => (
        <AppProviders container={container}>
          <Stack screenOptions={{ headerShown: false }} />
        </AppProviders>
      ),
      'saved/index': SavedPlacesRoute,
      'saved/collections/[collectionId]': CollectionRoute,
      'destinations/[destinationId]': DestinationStub,
    },
    { initialUrl },
  );
  return { ...storage, dependencies, user: userEvent.setup() };
}

async function stored(repository: Awaited<ReturnType<typeof launch>>['favoritesRepository']) {
  const result = await repository.loadAll(TRIP_OWNER);
  if (!result.ok) throw result.error;
  return result.value;
}

const button = (name: string | RegExp) => screen.findByRole('button', { name });
const rowIds = () => screen.queryAllByTestId(/^saved-place-/).map((node) => node.props.testID as string);

describe('Saved Places edge cases', () => {
  it('AC7 treats a search of only spaces as no search and lists every place', async () => {
    const { user } = await launch({ favorites: [lisbon, julesVerne] });
    await screen.findByTestId('saved-place-lisbon-fav');

    await user.type(screen.getByLabelText('Search saved places'), '    ');

    expect(screen.queryByTestId('favorites-no-results')).toBeNull();
    expect(rowIds()).toEqual(['saved-place-jules-verne', 'saved-place-lisbon-fav']);
  });

  it('AC7 matches a search with extra spaces and punctuation around the words', async () => {
    const { user } = await launch({ favorites: [lisbon, julesVerne] });
    await screen.findByTestId('saved-place-lisbon-fav');

    await user.type(screen.getByLabelText('Search saved places'), '  le   jules-verne! ');

    await waitFor(() => expect(rowIds()).toEqual(['saved-place-jules-verne']));
  });

  it('AC8 shows the empty state again after the last saved place is removed', async () => {
    const { user, favoritesRepository } = await launch({ favorites: [lisbon] });

    await user.press(await button('More actions for Lisbon'));
    const actions = await screen.findByTestId('saved-place-actions');
    await user.press(within(actions).getByRole('button', { name: 'Remove' }));
    const confirm = await screen.findByTestId('remove-favorite-confirm');
    await user.press(within(confirm).getByRole('button', { name: 'Remove' }));

    expect(await screen.findByTestId('favorites-empty')).toBeOnTheScreen();
    expect((await stored(favoritesRepository)).favorites).toEqual([]);
  });

  it('AC4 starts the new collection sheet empty and without the last error each time it opens', async () => {
    const { user } = await launch({ collections: [food] });

    await user.press(await button('New collection'));
    await user.type(await screen.findByLabelText('Collection name'), 'lisbon food');
    await user.press(await button('Save collection'));
    expect(await screen.findByText(/already have a collection/i)).toBeOnTheScreen();
    await user.press(within(screen.getByTestId('collection-name-sheet')).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByLabelText('Collection name')).toBeNull());

    await user.press(await button('New collection'));

    expect((await screen.findByLabelText('Collection name')).props.value).toBe('');
    expect(screen.queryByText(/already have a collection/i)).toBeNull();
  });

  it('AC4 accepts a name in another script with emoji, and shows it on its card', async () => {
    const { user, favoritesRepository } = await launch({});

    await user.press(await button('New collection'));
    await user.type(await screen.findByLabelText('Collection name'), '東京 ラーメン 🍜');
    await user.press(await button('Save collection'));

    expect((await screen.findAllByText('東京 ラーメン 🍜')).length).toBeGreaterThan(0);
    expect((await stored(favoritesRepository)).collections.map(({ name }) => name)).toContain('東京 ラーメン 🍜');
  });
});

describe('Collection details edge cases', () => {
  it('AC8 shows the empty state once the last place is removed from the collection, and keeps it saved', async () => {
    const { user, favoritesRepository } = await launch({
      favorites: [julesVerne],
      collections: [food],
      memberships: [{ collectionId: 'food', favoriteId: 'jules-verne' }],
      initialUrl: '/saved/collections/food',
    });

    await user.press(await button('Remove from collection: Le Jules Verne'));

    expect(await screen.findByTestId('collection-empty')).toBeOnTheScreen();
    const saved = await stored(favoritesRepository);
    expect(saved.favorites.map(({ id }) => id)).toEqual(['jules-verne']);
    expect(saved.memberships).toEqual([]);
  });

  it('shows "invalid link" for a collection link with characters ids never have', async () => {
    await launch({ initialUrl: '/saved/collections/food%3Bdrop' });

    expect(await screen.findByText("This link isn't valid")).toBeOnTheScreen();
  });

  it("says a collection of another account doesn't exist instead of showing it", async () => {
    const { favoritesRepository } = await launch({ initialUrl: '/saved/collections/theirs' });
    await favoritesRepository.insertCollection('someone-else', customCollection({ id: 'theirs', name: 'Theirs' }));

    expect(await screen.findByTestId('collection-not-found')).toBeOnTheScreen();
    expect(screen.queryByText('Theirs')).toBeNull();
  });

  it('opens a default collection by its link with its translated name and no Rename or Delete', async () => {
    await launch({
      favorites: [lisbon],
      memberships: [{ collectionId: 'want-to-visit', favoriteId: 'lisbon-fav' }],
      initialUrl: '/saved/collections/want-to-visit',
    });

    expect(await screen.findByRole('header', { name: 'Want to Visit' })).toBeOnTheScreen();
    expect(screen.getByText('1 place')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Rename collection' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete collection' })).toBeNull();
  });
});
