import { userEvent } from '@testing-library/react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { Text } from 'react-native';

import CollectionRoute from '@/app/(app)/saved/collections/[collectionId]';
import SavedPlacesRoute from '@/app/(app)/saved/index';
import { AppProviders } from '@/bootstrap/AppProviders';
import { type AppDependencies } from '@/core/di/AppDependencies';
import { AppError } from '@/core/errors/AppError';
import { createI18n } from '@/core/i18n/createI18n';
import { err } from '@/core/result';
import { type Collection, type CollectionMembership } from '@/features/favorites/domain/Collection';
import { type Favorite } from '@/features/favorites/domain/Favorite';
import { createTestStore } from '@/testing/createTestStore';
import {
  customCollection,
  DEFAULT_COLLECTION_IDS,
  favorite,
  FAVORITES_NOW,
  restaurantFavorite,
  seededFavoritesDatabase,
} from '@/testing/favoritesFixtures';
import { FakeConnectivityService, OFFLINE } from '@/testing/FakeConnectivityService';
import { FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { ManualClock } from '@/testing/ManualClock';
import { createTestDependencies } from '@/testing/testDependencies';
import { TRIP_OWNER } from '@/testing/tripFixtures';

const lisbon = favorite({ id: 'lisbon-fav', savedAt: FAVORITES_NOW });
const portugal = favorite({
  id: 'portugal-fav',
  targetId: 'country-pt',
  category: 'country',
  name: 'Portugal',
  subtitle: 'Europe',
  flagEmoji: '🇵🇹',
  savedAt: FAVORITES_NOW + 1_000,
});
const saoPaulo = favorite({
  id: 'sao-paulo-fav',
  targetId: 'sao-paulo',
  name: 'São Paulo',
  subtitle: 'Brazil',
  savedAt: FAVORITES_NOW + 2_000,
});
const julesVerne = restaurantFavorite({ id: 'jules-verne', savedAt: FAVORITES_NOW + 3_000 });
const flamme = favorite({
  id: 'flamme',
  targetId: 'osm:node/105',
  category: 'landmark',
  name: 'Flamme de la Liberté',
  subtitle: "Place de l'Alma",
  address: "Place de l'Alma",
  imageUrl: null,
  flagEmoji: null,
  savedAt: FAVORITES_NOW + 4_000,
});
const food = customCollection({ id: 'food', name: 'Lisbon food' });

interface LaunchOptions {
  readonly favorites?: readonly Favorite[];
  readonly collections?: readonly Collection[];
  readonly memberships?: readonly Pick<CollectionMembership, 'collectionId' | 'favoriteId'>[];
  readonly overrides?: Partial<AppDependencies>;
  readonly initialUrl?: string;
}

function DestinationStub() {
  const { destinationId } = useLocalSearchParams<{ destinationId: string }>();
  return <Text>{`Destination ${destinationId}`}</Text>;
}

async function launch({
  favorites = [],
  collections = [],
  memberships = [],
  overrides = {},
  initialUrl = '/saved',
}: LaunchOptions = {}) {
  const storage = await seededFavoritesDatabase({ favorites, collections, memberships });
  const dependencies = createTestDependencies({
    database: storage.database,
    clock: new ManualClock(FAVORITES_NOW + 60_000),
    httpClientFactory: new FakeHttpClientFactory(),
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
      'saved/index': SavedPlacesRoute,
      'saved/collections/[collectionId]': CollectionRoute,
      explore: () => <Text>Explore screen</Text>,
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
const row = (id: string) => screen.findByTestId(`saved-place-${id}`);
const rowIds = () => screen.queryAllByTestId(/^saved-place-/).map((node) => node.props.testID as string);
const card = (id: string) => screen.findByTestId(`collection-card-${id}`);

describe('Saved Places', () => {
  it('AC8 shows an empty state with an action that opens Explore', async () => {
    const { user } = await launch();

    const empty = await screen.findByTestId('favorites-empty');
    await user.press(within(empty).getByRole('button'));

    expect(await screen.findByText('Explore screen')).toBeOnTheScreen();
  });

  it('AC3 shows the four default collections, translated, with their counts', async () => {
    await launch({
      favorites: [julesVerne],
      memberships: [{ collectionId: 'favorite-restaurants', favoriteId: 'jules-verne' }],
    });

    expect(within(await card('want-to-visit')).getByText('Want to Visit')).toBeOnTheScreen();
    expect(within(await card('must-visit')).getByText('Must Visit')).toBeOnTheScreen();
    expect(within(await card('favorite-restaurants')).getByText('Favorite Restaurants')).toBeOnTheScreen();
    expect(within(await card('favorite-restaurants')).getByText(/1 place/)).toBeOnTheScreen();
    expect(within(await card('favorite-attractions')).getByText('Favorite Attractions')).toBeOnTheScreen();
  });

  it('AC3 shows the default collections in Spanish', async () => {
    const storage = await seededFavoritesDatabase();
    const dependencies = createTestDependencies({ database: storage.database });
    const container = { dependencies, store: createTestStore(dependencies), i18n: createI18n('es') };
    await renderRouter(
      {
        _layout: () => (
          <AppProviders container={container}>
            <Stack screenOptions={{ headerShown: false }} />
          </AppProviders>
        ),
        'saved/index': SavedPlacesRoute,
      },
      { initialUrl: '/saved' },
    );

    const wantToVisit = await card('want-to-visit');
    expect(within(wantToVisit).queryByText('Want to Visit')).toBeNull();
    expect(within(wantToVisit).getAllByText(/\S/).length).toBeGreaterThan(0);
  });

  it('AC9 lists saved places newest first, with their category', async () => {
    await launch({ favorites: [lisbon, portugal, julesVerne] });

    const restaurant = await row('jules-verne');
    expect(rowIds()).toEqual(['saved-place-jules-verne', 'saved-place-portugal-fav', 'saved-place-lisbon-fav']);
    expect(within(restaurant).getByText('Le Jules Verne')).toBeOnTheScreen();
    expect(within(restaurant).getByText('Restaurant')).toBeOnTheScreen();
    expect(within(await row('portugal-fav')).getByText('Country')).toBeOnTheScreen();
    expect(within(await row('lisbon-fav')).getByText('Destination')).toBeOnTheScreen();
  });

  it('AC7 searches name and subtitle ignoring case and accents', async () => {
    const { user } = await launch({ favorites: [lisbon, portugal, saoPaulo, julesVerne] });
    await row('lisbon-fav');

    await user.type(screen.getByLabelText('Search saved places'), 'sao');
    await waitFor(() => expect(rowIds()).toEqual(['saved-place-sao-paulo-fav']));

    await user.clear(screen.getByLabelText('Search saved places'));
    await user.type(screen.getByLabelText('Search saved places'), 'PORTUGAL');
    await waitFor(() => expect(rowIds()).toEqual(['saved-place-portugal-fav', 'saved-place-lisbon-fav']));
  });

  it('AC7 filters by category chip, together with the search', async () => {
    const { user } = await launch({ favorites: [lisbon, portugal, julesVerne, flamme] });
    await row('lisbon-fav');

    for (const label of ['All', 'Destinations', 'Countries', 'Attractions', 'Restaurants', 'Landmarks']) {
      expect(screen.getByRole('button', { name: label })).toBeOnTheScreen();
    }

    await user.press(screen.getByRole('button', { name: 'Restaurants' }));
    await waitFor(() => expect(rowIds()).toEqual(['saved-place-jules-verne']));

    await user.press(screen.getByRole('button', { name: 'Landmarks' }));
    await waitFor(() => expect(rowIds()).toEqual(['saved-place-flamme']));

    await user.press(screen.getByRole('button', { name: 'Destinations' }));
    await user.type(screen.getByLabelText('Search saved places'), 'lis');
    await waitFor(() => expect(rowIds()).toEqual(['saved-place-lisbon-fav']));
  });

  it('AC7 says when nothing matches and clears the search and filter', async () => {
    const { user } = await launch({ favorites: [lisbon, julesVerne] });
    await row('lisbon-fav');

    await user.press(screen.getByRole('button', { name: 'Countries' }));
    await user.type(screen.getByLabelText('Search saved places'), 'zzqx');

    const noResults = await screen.findByTestId('favorites-no-results');
    expect(within(noResults).getByText(/No saved places match/)).toBeOnTheScreen();
    await user.press(within(noResults).getByRole('button'));

    await waitFor(() => expect(rowIds()).toEqual(['saved-place-jules-verne', 'saved-place-lisbon-fav']));
    expect(screen.getByLabelText('Search saved places').props.value).toBe('');
  });

  it('AC2 opens a saved destination or country', async () => {
    const { user } = await launch({ favorites: [portugal] });

    await user.press(within(await row('portugal-fav')).getByText('Portugal'));

    expect(await screen.findByText('Destination country-pt')).toBeOnTheScreen();
  });

  it('AC2 removes a saved place only after confirmation, with its memberships', async () => {
    const { user, favoritesRepository } = await launch({
      favorites: [lisbon, julesVerne],
      memberships: [{ collectionId: 'must-visit', favoriteId: 'jules-verne' }],
    });

    await user.press(within(await row('jules-verne')).getByRole('button', { name: /more/i }));
    const actions = await screen.findByTestId('saved-place-actions');
    await user.press(within(actions).getByRole('button', { name: 'Remove' }));

    const confirm = await screen.findByTestId('remove-favorite-confirm');
    await user.press(within(confirm).getByRole('button', { name: /keep|cancel/i }));
    expect((await stored(favoritesRepository)).favorites).toHaveLength(2);

    await user.press(within(await row('jules-verne')).getByRole('button', { name: /more/i }));
    await user.press(within(await screen.findByTestId('saved-place-actions')).getByRole('button', { name: 'Remove' }));
    await user.press(
      within(await screen.findByTestId('remove-favorite-confirm')).getByRole('button', { name: 'Remove' }),
    );

    await waitFor(() => expect(rowIds()).toEqual(['saved-place-lisbon-fav']));
    const after = await stored(favoritesRepository);
    expect(after.favorites.map(({ id }) => id)).toEqual(['lisbon-fav']);
    expect(after.memberships).toEqual([]);
    expect(within(await card('must-visit')).getByText(/0 places/)).toBeOnTheScreen();
  });

  it('AC6 adds a place to several collections from its collection picker', async () => {
    const { user, favoritesRepository } = await launch({ favorites: [julesVerne], collections: [food] });

    await user.press(within(await row('jules-verne')).getByRole('button', { name: /more/i }));
    await user.press(
      within(await screen.findByTestId('saved-place-actions')).getByRole('button', { name: /collections/i }),
    );

    const picker = await screen.findByTestId('collection-picker');
    await user.press(within(picker).getByRole('checkbox', { name: 'Must Visit' }));
    await user.press(within(picker).getByRole('checkbox', { name: 'Lisbon food' }));
    await user.press(within(picker).getByRole('button', { name: /save/i }));

    await waitFor(async () =>
      expect((await stored(favoritesRepository)).memberships.map(({ collectionId }) => collectionId).sort()).toEqual([
        'food',
        'must-visit',
      ]),
    );
    expect(within(await card('food')).getByText(/1 place/)).toBeOnTheScreen();
    expect(within(await card('must-visit')).getByText(/1 place/)).toBeOnTheScreen();
  });

  it('AC6 shows the ticked collections when the picker opens again, and unticking removes only the membership', async () => {
    const { user, favoritesRepository } = await launch({
      favorites: [julesVerne],
      collections: [food],
      memberships: [
        { collectionId: 'food', favoriteId: 'jules-verne' },
        { collectionId: 'must-visit', favoriteId: 'jules-verne' },
      ],
    });

    await user.press(within(await row('jules-verne')).getByRole('button', { name: /more/i }));
    await user.press(
      within(await screen.findByTestId('saved-place-actions')).getByRole('button', { name: /collections/i }),
    );
    const picker = await screen.findByTestId('collection-picker');
    expect(within(picker).getByRole('checkbox', { name: 'Must Visit' })).toBeChecked();
    expect(within(picker).getByRole('checkbox', { name: 'Lisbon food' })).toBeChecked();
    expect(within(picker).getByRole('checkbox', { name: 'Want to Visit' })).not.toBeChecked();

    await user.press(within(picker).getByRole('checkbox', { name: 'Lisbon food' }));
    await user.press(within(picker).getByRole('button', { name: /save/i }));

    await waitFor(async () =>
      expect((await stored(favoritesRepository)).memberships.map(({ collectionId }) => collectionId)).toEqual([
        'must-visit',
      ]),
    );
    expect((await stored(favoritesRepository)).favorites).toHaveLength(1);
  });

  it('AC8 shows a storage failure with a retry that recovers', async () => {
    const storage = await seededFavoritesDatabase({ favorites: [lisbon] });
    const working = createTestDependencies({ database: storage.database });
    const getFavorites = {
      execute: jest
        .fn()
        .mockResolvedValueOnce(err(new AppError('storage', 'locked')))
        .mockImplementation(() => working.getFavorites.execute()),
    };
    const { user } = await launch({ overrides: { getFavorites } });

    expect(await screen.findByText("We couldn't access data saved on this device.")).toBeOnTheScreen();
    await user.press(await button('Try again'));

    expect(await row('lisbon-fav')).toBeOnTheScreen();
  });

  it('AC9 works offline', async () => {
    await launch({
      favorites: [lisbon, julesVerne],
      overrides: { connectivity: new FakeConnectivityService(OFFLINE) },
    });

    expect(await row('jules-verne')).toBeOnTheScreen();
    expect(await row('lisbon-fav')).toBeOnTheScreen();
    expect(await card('want-to-visit')).toBeOnTheScreen();
  });
});

describe('Collections', () => {
  it('AC4 creates a custom collection from the Favorites screen', async () => {
    const { user, favoritesRepository, database } = await launch();

    await user.press(await button('New collection'));
    await user.type(await screen.findByLabelText('Collection name'), '  Lisbon food ');
    await user.press(await button('Save collection'));

    expect((await screen.findAllByText('Lisbon food')).length).toBeGreaterThan(0);
    const saved = await stored(favoritesRepository);
    expect(saved.collections.filter(({ kind }) => kind === 'custom')).toEqual([
      expect.objectContaining({ name: 'Lisbon food' }),
    ]);
    const reloaded = await createTestDependencies({ database }).getFavorites.execute();
    expect(reloaded.ok && reloaded.value.collections.map(({ name }) => name)).toContain('Lisbon food');
  });

  it.each([
    ['an empty name', '   ', /give the collection a name/i],
    ['a name over 40 characters', 'x'.repeat(41), /at most 40 characters/i],
    ['a duplicate name', 'LISBON FOOD', /already have a collection/i],
  ])('AC4 shows an inline error for %s and saves nothing', async (_label, name, message) => {
    const { user, favoritesRepository } = await launch({ collections: [food] });

    await user.press(await button('New collection'));
    await user.type(await screen.findByLabelText('Collection name'), name);
    await user.press(await button('Save collection'));

    expect(await screen.findByText(message)).toBeOnTheScreen();
    expect((await stored(favoritesRepository)).collections).toHaveLength(5);
  });

  it('AC4 refuses a 51st custom collection with a message', async () => {
    const fifty = Array.from({ length: 50 }, (_, index) =>
      customCollection({ id: `c${index}`, name: `Collection ${index}`, createdAt: FAVORITES_NOW + index }),
    );
    const { user, favoritesRepository } = await launch({ collections: fifty });

    await user.press(await button('New collection'));
    await user.type(await screen.findByLabelText('Collection name'), 'One more');
    await user.press(await button('Save collection'));

    expect(await screen.findByText(/up to 50 collections/i)).toBeOnTheScreen();
    expect((await stored(favoritesRepository)).collections).toHaveLength(54);
  });

  it('AC6 opens a collection listing exactly its places, newest first', async () => {
    const { user } = await launch({
      favorites: [lisbon, julesVerne, flamme],
      collections: [food],
      memberships: [
        { collectionId: 'food', favoriteId: 'lisbon-fav' },
        { collectionId: 'food', favoriteId: 'jules-verne' },
      ],
    });

    await user.press(await card('food'));

    const details = await screen.findByTestId('collection-details');
    const detailRowIds = () =>
      within(details)
        .queryAllByTestId(/^saved-place-/)
        .map((node) => node.props.testID as string);
    await waitFor(() => expect(detailRowIds()).toEqual(['saved-place-jules-verne', 'saved-place-lisbon-fav']));
    expect(within(details).getAllByText('Lisbon food').length).toBeGreaterThan(0);
  });

  it('AC8 shows an empty state for an empty collection', async () => {
    await launch({ favorites: [lisbon], initialUrl: '/saved/collections/must-visit' });

    expect(await screen.findByTestId('collection-empty')).toBeOnTheScreen();
    expect(rowIds()).toEqual([]);
  });

  it('AC3 offers no Rename or Delete on a default collection', async () => {
    await launch({ initialUrl: '/saved/collections/want-to-visit' });

    expect(await screen.findByTestId('collection-details')).toBeOnTheScreen();
    expect(screen.getAllByText('Want to Visit').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Rename collection' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete collection' })).toBeNull();
  });

  it('AC5 renames a custom collection and shows the new name everywhere', async () => {
    const { user, favoritesRepository } = await launch({ collections: [food], initialUrl: '/saved/collections/food' });

    await user.press(await button('Rename collection'));
    const input = await screen.findByLabelText('Collection name');
    expect(input.props.value).toBe('Lisbon food');
    await user.clear(input);
    await user.type(input, 'Porto food');
    await user.press(await button('Save collection'));

    expect((await screen.findAllByText('Porto food')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Lisbon food')).toBeNull();
    expect((await stored(favoritesRepository)).collections.find(({ id }) => id === 'food')?.name).toBe('Porto food');
  });

  it('AC5 shows the rename error inline and keeps the old name', async () => {
    const museums = customCollection({ id: 'museums', name: 'Museums', createdAt: FAVORITES_NOW + 1 });
    const { user, favoritesRepository } = await launch({
      collections: [food, museums],
      initialUrl: '/saved/collections/food',
    });

    await user.press(await button('Rename collection'));
    const input = await screen.findByLabelText('Collection name');
    await user.clear(input);
    await user.type(input, 'museums');
    await user.press(await button('Save collection'));

    expect(await screen.findByText(/already have a collection/i)).toBeOnTheScreen();
    expect((await stored(favoritesRepository)).collections.find(({ id }) => id === 'food')?.name).toBe('Lisbon food');
  });

  it('AC5 deletes a custom collection after confirmation; its places stay saved', async () => {
    const { user, favoritesRepository } = await launch({
      favorites: [julesVerne],
      collections: [food],
      memberships: [
        { collectionId: 'food', favoriteId: 'jules-verne' },
        { collectionId: 'must-visit', favoriteId: 'jules-verne' },
      ],
      initialUrl: '/saved',
    });
    await user.press(await card('food'));

    await user.press(await button('Delete collection'));
    expect(await screen.findByText('Delete this collection?')).toBeOnTheScreen();
    await user.press(await button(/keep|cancel/i));
    expect((await stored(favoritesRepository)).collections).toHaveLength(5);

    await user.press(await button('Delete collection'));
    await user.press(await button('Delete'));

    expect(await row('jules-verne')).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByTestId('collection-card-food')).toBeNull());
    const after = await stored(favoritesRepository);
    expect(after.collections.map(({ id }) => id)).toEqual(DEFAULT_COLLECTION_IDS);
    expect(after.favorites.map(({ id }) => id)).toEqual(['jules-verne']);
    expect(after.memberships.map(({ collectionId }) => collectionId)).toEqual(['must-visit']);
  });

  it('AC6 removes a place from a collection without unsaving it', async () => {
    const { user, favoritesRepository } = await launch({
      favorites: [julesVerne],
      collections: [food],
      memberships: [{ collectionId: 'food', favoriteId: 'jules-verne' }],
      initialUrl: '/saved/collections/food',
    });

    await user.press(within(await row('jules-verne')).getByRole('button', { name: /remove from collection/i }));

    await waitFor(() => expect(rowIds()).toEqual([]));
    expect(await screen.findByTestId('collection-empty')).toBeOnTheScreen();
    const after = await stored(favoritesRepository);
    expect(after.memberships).toEqual([]);
    expect(after.favorites.map(({ id }) => id)).toEqual(['jules-verne']);
  });

  it('says when the collection does not exist', async () => {
    await launch({ initialUrl: '/saved/collections/gone' });
    expect((await screen.findAllByText(/not found|couldn't find/i)).length).toBeGreaterThan(0);
  });
});
