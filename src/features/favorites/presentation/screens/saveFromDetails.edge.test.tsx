import { screen, userEvent, waitFor } from '@testing-library/react-native';

import { type AppDependencies } from '@/core/di/AppDependencies';
import { DestinationScreen } from '@/features/discover/presentation/screens/DestinationScreen';
import { stubDiscoverApis } from '@/testing/discoverFixtures';
import { favorite, seededFavoritesDatabase } from '@/testing/favoritesFixtures';
import { FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { ManualClock } from '@/testing/ManualClock';
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

async function savedTargets(dependencies: AppDependencies): Promise<string[]> {
  const result = await dependencies.favoritesRepository.loadAll(TRIP_OWNER);
  if (!result.ok) throw result.error;
  return result.value.favorites.map(({ targetId }) => targetId);
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

const savedPortugal = favorite({ id: 'pt', targetId: 'country-pt', category: 'country', name: 'Portugal' });

describe('Save on the destination screen, edge cases', () => {
  it('AC1 shows a country saved earlier as saved when a link spells its code in capitals (country-PT)', async () => {
    await showDestination('country-PT', [savedPortugal]);
    await screen.findByRole('header', { name: 'Portugal' });

    expect(await screen.findByRole('button', { name: 'Saved' })).toBeOnTheScreen();
  });

  it('AC1 saves a country opened from a capitalised link under its usual id, once', async () => {
    const { user, dependencies } = await showDestination('country-PT');
    await screen.findByRole('header', { name: 'Portugal' });

    await user.press(await screen.findByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('button', { name: 'Saved' })).toBeOnTheScreen();
    expect(await savedTargets(dependencies)).toEqual(['country-pt']);
  });

  it('AC2 unsaves from a capitalised link the country saved from the usual link', async () => {
    const { user, dependencies } = await showDestination('country-PT', [savedPortugal]);

    await user.press(await screen.findByRole('button', { name: 'Saved' }));

    expect(await screen.findByRole('button', { name: 'Save' })).toBeOnTheScreen();
    await waitFor(async () => expect(await savedTargets(dependencies)).toEqual([]));
  });

  it('shows no Save button while the destination cannot be loaded', async () => {
    await showDestination('kyotox');

    await waitFor(() => expect(screen.queryByTestId('destination-loading')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Saved' })).toBeNull();
  });
});
