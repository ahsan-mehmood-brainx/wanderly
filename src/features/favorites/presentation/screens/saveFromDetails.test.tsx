import { fireEvent, screen, userEvent, waitFor, within } from '@testing-library/react-native';

import { type AppDependencies } from '@/core/di/AppDependencies';
import { DestinationScreen } from '@/features/discover/presentation/screens/DestinationScreen';
import { ExploreMapScreen } from '@/features/map/presentation/screens/ExploreMapScreen';
import { stubDiscoverApis } from '@/testing/discoverFixtures';
import { favorite, seededFavoritesDatabase } from '@/testing/favoritesFixtures';
import { FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { FakeLocationService } from '@/testing/FakeLocationService';
import { ManualClock } from '@/testing/ManualClock';
import { stubNominatim, stubOverpass } from '@/testing/mapFixtures';
import { renderWithProviders } from '@/testing/renderWithProviders';
import { TRIP_OWNER } from '@/testing/tripFixtures';
import { stubWeatherApi, WEATHER_NOW } from '@/testing/weatherFixtures';

import { type Favorite } from '../../domain/Favorite';

jest.mock('expo-router', () => {
  const actual = jest.requireActual('expo-router');
  return {
    ...actual,
    router: { push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn() },
    // No navigator here: render the header's right-hand actions in place so they can be pressed.
    Stack: Object.assign(() => null, {
      Screen: ({ options }: { options?: { headerRight?: (props: { canGoBack: boolean }) => unknown } }) =>
        options?.headerRight?.({ canGoBack: true }) ?? null,
    }),
  };
});

async function savedFavorites(dependencies: AppDependencies): Promise<readonly Favorite[]> {
  const result = await dependencies.favoritesRepository.loadAll(TRIP_OWNER);
  if (!result.ok) throw result.error;
  return result.value.favorites;
}

async function showDestination(id: string, favorites: readonly Favorite[] = []) {
  const { database } = await seededFavoritesDatabase({ favorites });
  const httpClientFactory = new FakeHttpClientFactory();
  stubDiscoverApis(httpClientFactory);
  stubWeatherApi(httpClientFactory);
  const rendered = await renderWithProviders(<DestinationScreen destinationId={id} />, {
    dependencies: { database, httpClientFactory, clock: new ManualClock(WEATHER_NOW) },
  });
  return { ...rendered, user: userEvent.setup() };
}

describe('Save on the destination screen', () => {
  it('AC2 saves a country as Country and shows it as saved', async () => {
    const { user, dependencies } = await showDestination('country-pt');
    await screen.findByRole('header', { name: 'Portugal' });

    await user.press(await screen.findByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('button', { name: 'Saved' })).toBeOnTheScreen();
    expect(await savedFavorites(dependencies)).toEqual([
      expect.objectContaining({ targetId: 'country-pt', category: 'country', name: 'Portugal' }),
    ]);
  });

  it('AC2 saves a city as Destination', async () => {
    const { user, dependencies } = await showDestination('kyoto');
    await screen.findByRole('header', { name: 'Kyoto' });

    await user.press(await screen.findByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('button', { name: 'Saved' })).toBeOnTheScreen();
    expect(await savedFavorites(dependencies)).toEqual([
      expect.objectContaining({ targetId: 'kyoto', category: 'destination', name: 'Kyoto', subtitle: 'Japan' }),
    ]);
  });

  it('AC2 shows a destination saved earlier as saved, and unsaving removes it', async () => {
    const saved = favorite({ id: 'pt', targetId: 'country-pt', category: 'country', name: 'Portugal' });
    const { user, dependencies } = await showDestination('country-pt', [saved]);

    await user.press(await screen.findByRole('button', { name: 'Saved' }));

    expect(await screen.findByRole('button', { name: 'Save' })).toBeOnTheScreen();
    await waitFor(async () => expect(await savedFavorites(dependencies)).toEqual([]));
  });

  it('AC1 keeps one saved record when Save is double-tapped', async () => {
    const { dependencies } = await showDestination('country-pt');
    await screen.findByRole('header', { name: 'Portugal' });

    const save = await screen.findByRole('button', { name: 'Save' });
    fireEvent.press(save);
    fireEvent.press(save);

    expect(await screen.findByRole('button', { name: 'Saved' })).toBeOnTheScreen();
    expect(await savedFavorites(dependencies)).toHaveLength(1);
  });
});

const RESTAURANT_MARKER = 'place-marker-osm:node/102';

async function showMap() {
  const httpClientFactory = new FakeHttpClientFactory();
  stubOverpass(httpClientFactory);
  stubNominatim(httpClientFactory);
  const location = new FakeLocationService();
  location.permission = 'granted';
  const rendered = await renderWithProviders(<ExploreMapScreen />, {
    dependencies: { httpClientFactory, mapLocationService: location, clock: new ManualClock(1_800_000_000_000) },
  });
  return { ...rendered, user: userEvent.setup() };
}

async function openPlace(marker: string) {
  fireEvent.press(await screen.findByTestId(marker));
  return screen.findByTestId('place-sheet');
}

describe('Save in the map place sheet', () => {
  it('AC2 saves a restaurant as Restaurant and shows it as saved', async () => {
    const { user, dependencies } = await showMap();
    const sheet = await openPlace(RESTAURANT_MARKER);

    await user.press(within(sheet).getByRole('button', { name: 'Save' }));

    expect(await within(sheet).findByRole('button', { name: 'Saved' })).toBeOnTheScreen();
    expect(await savedFavorites(dependencies)).toEqual([
      expect.objectContaining({
        targetId: 'osm:node/102',
        category: 'restaurant',
        name: 'Le Jules Verne',
        latitude: 48.8583,
        longitude: 2.2945,
      }),
    ]);
  });

  it.each([
    ['place-marker-osm:node/105', 'landmark', 'Flamme de la Liberté'],
    ['place-marker-osm:node/101', 'attraction', 'Musée du quai Branly'],
    ['place-marker-osm:way/103', 'attraction', 'Champ de Mars'],
    ['place-marker-osm:node/106', 'attraction', 'Trocadéro viewpoint'],
  ])('AC2 saves %s as %s', async (marker, category, name) => {
    const { user, dependencies } = await showMap();
    const sheet = await openPlace(marker);

    await user.press(within(sheet).getByRole('button', { name: 'Save' }));

    await waitFor(async () =>
      expect(await savedFavorites(dependencies)).toEqual([expect.objectContaining({ category, name })]),
    );
  });

  it('AC2 offers no Save for a hotel', async () => {
    await showMap();
    const sheet = await openPlace('place-marker-osm:node/104');

    expect(within(sheet).getByRole('button', { name: 'Directions' })).toBeOnTheScreen();
    expect(within(sheet).queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('AC2 unsaves a saved place from the sheet', async () => {
    const { user, dependencies } = await showMap();
    const sheet = await openPlace(RESTAURANT_MARKER);
    await user.press(within(sheet).getByRole('button', { name: 'Save' }));

    await user.press(await within(sheet).findByRole('button', { name: 'Saved' }));

    expect(await within(sheet).findByRole('button', { name: 'Save' })).toBeOnTheScreen();
    await waitFor(async () => expect(await savedFavorites(dependencies)).toEqual([]));
  });

  it('AC1 keeps one saved record when Save is double-tapped', async () => {
    const { dependencies } = await showMap();
    const sheet = await openPlace(RESTAURANT_MARKER);

    const save = within(sheet).getByRole('button', { name: 'Save' });
    fireEvent.press(save);
    fireEvent.press(save);

    expect(await within(sheet).findByRole('button', { name: 'Saved' })).toBeOnTheScreen();
    expect(await savedFavorites(dependencies)).toHaveLength(1);
  });
});
