import { act, screen, userEvent, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AppState, type AppStateStatus } from 'react-native';

import { signIn } from '@/features/auth/presentation/state/authSlice';
import { routes } from '@/shared/navigation/routes';
import { TEST_USER } from '@/testing/authFixtures';
import { countryPage, httpFailure, stubDiscoverApis, WORLD_DTOS } from '@/testing/discoverFixtures';
import { apiSuccess, FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { renderWithProviders } from '@/testing/renderWithProviders';

import { RECENTLY_VIEWED_KEY } from '../../data/StorageDiscoveryHistoryRepository';
import { DiscoverScreen } from './DiscoverScreen';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), replace: jest.fn(), navigate: jest.fn() },
}));

const MORNING = () => new Date(2026, 10, 10, 9, 0);

async function setup(
  options: {
    now?: () => Date;
    recentlyViewed?: unknown[];
    configureApis?: (apis: ReturnType<typeof stubDiscoverApis>) => void;
  } = {},
) {
  const httpClientFactory = new FakeHttpClientFactory();
  const apis = stubDiscoverApis(httpClientFactory);
  options.configureApis?.(apis);
  const keyValueStore = new InMemoryKeyValueStore(
    options.recentlyViewed ? { [RECENTLY_VIEWED_KEY]: JSON.stringify(options.recentlyViewed) } : {},
  );
  const rendered = await renderWithProviders(<DiscoverScreen now={options.now ?? MORNING} />, {
    dependencies: { httpClientFactory, keyValueStore },
  });
  return { ...apis, ...rendered, user: userEvent.setup() };
}

describe('DiscoverScreen', () => {
  beforeEach(() => jest.mocked(router.push).mockClear());

  it('greets by time of day, and by name when signed in', async () => {
    const { store } = await setup();
    expect(await screen.findByText('Good morning')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Where to next?' })).toBeOnTheScreen();

    await act(async () => {
      store.dispatch(signIn.fulfilled(TEST_USER, 'request', { username: 'emilys', password: 'x' }));
    });
    expect(screen.getByText('Good morning, Emily')).toBeOnTheScreen();
  });

  it('updates the greeting when the app returns to the foreground', async () => {
    const listeners: ((state: AppStateStatus) => void)[] = [];
    // The React Native preset's AppState is itself a mock; spying and `mockRestore()` would wipe
    // its implementation for later tests, so swap the function and put the original back.
    const original = AppState.addEventListener;
    AppState.addEventListener = ((_type: string, listener: (state: AppStateStatus) => void) => {
      listeners.push(listener);
      return { remove: jest.fn() };
    }) as typeof AppState.addEventListener;
    let current = MORNING();
    try {
      await setup({ now: () => current });
      expect(await screen.findByText('Good morning')).toBeOnTheScreen();

      current = new Date(2026, 10, 10, 19, 0);
      await act(async () => listeners.forEach((listener) => listener('active')));

      expect(screen.getByText('Good evening')).toBeOnTheScreen();
    } finally {
      AppState.addEventListener = original;
    }
  });

  it('shows featured, popular, trending and recommended destinations', async () => {
    await setup();

    const featured = await screen.findByTestId('section-featured');
    expect(await within(featured).findByRole('button', { name: /^Kyoto,/ })).toBeOnTheScreen();
    const popular = screen.getByTestId('section-popular');
    expect(await within(popular).findByRole('button', { name: 'France, Europe' })).toBeOnTheScreen();
    const trending = screen.getByTestId('section-trending');
    expect(await within(trending).findByRole('button', { name: /^Tbilisi,/ })).toBeOnTheScreen();
    // No history yet: recommendations fall back to popular picks.
    const recommended = screen.getByTestId('section-recommended');
    expect(
      await within(recommended).findByRole('button', { name: 'Kyoto, Popular with travellers' }),
    ).toBeOnTheScreen();
  });

  it('opens search from the search bar and a category chip', async () => {
    const { user } = await setup();

    await user.press(await screen.findByRole('search', { name: 'Search countries, cities and places' }));
    expect(router.push).toHaveBeenLastCalledWith(routes.search());

    await user.press(screen.getByRole('button', { name: 'Beaches' }));
    expect(router.push).toHaveBeenLastCalledWith(routes.search({ category: 'beach' }));
  });

  it('opens a destination from a card', async () => {
    const { user } = await setup();
    await user.press(await screen.findByRole('button', { name: 'France, Europe' }));
    expect(router.push).toHaveBeenCalledWith(routes.destination('country-fr'));
  });

  it('isolates failures to their own section, with retry', async () => {
    await setup({
      configureApis: ({ wikipedia }) => wikipedia.otherwise(() => httpFailure('server', 503)),
    });

    const featured = await screen.findByTestId('section-featured');
    expect(
      await within(featured).findByText(
        "We couldn't load this section. The service is having trouble right now. Please try again later.",
      ),
    ).toBeOnTheScreen();
    expect(within(featured).getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    // Popular countries only need the country catalogue.
    const popular = screen.getByTestId('section-popular');
    expect(await within(popular).findByRole('button', { name: 'France, Europe' })).toBeOnTheScreen();
  });

  it('lets a curated section recover after the catalogue fails, instead of caching bare cards', async () => {
    const { user, restCountries } = await setup({
      configureApis: ({ restCountries }) => restCountries.on('GET', '', httpFailure('rateLimited', 429)),
    });

    const featured = await screen.findByTestId('section-featured');
    const retry = await within(featured).findByRole('button', { name: 'Try again' });
    expect(within(screen.getByTestId('section-popular')).getByRole('button', { name: 'Try again' })).toBeOnTheScreen();

    restCountries.on('GET', '', apiSuccess(countryPage(WORLD_DTOS)));
    await user.press(retry);
    expect(await within(featured).findByRole('button', { name: /^Kyoto,/ })).toBeOnTheScreen();
  });

  it('lists recently viewed destinations and clears them', async () => {
    const { user, store } = await setup({
      recentlyViewed: [
        {
          id: 'country-pt',
          kind: 'country',
          name: 'Portugal',
          countryCode: 'PT',
          countryName: 'Portugal',
          imageUrl: null,
          flagEmoji: null,
          viewedAt: 1,
        },
      ],
    });

    const recent = await screen.findByTestId('section-recent');
    expect(within(recent).getByRole('button', { name: /^Portugal,/ })).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Clear recently viewed destinations' }));

    expect(store.getState().discover.recentlyViewed).toEqual([]);
    expect(screen.queryByTestId('section-recent')).toBeNull();
  });
});
