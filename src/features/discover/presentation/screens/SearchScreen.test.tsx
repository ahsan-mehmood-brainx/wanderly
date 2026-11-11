import { act, fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { routes } from '@/shared/navigation/routes';
import { countryPage, httpFailure, stubDiscoverApis, WORLD_DTOS } from '@/testing/discoverFixtures';
import { apiSuccess, FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { renderWithProviders } from '@/testing/renderWithProviders';

import { SEARCH_HISTORY_KEY } from '../../data/StorageDiscoveryHistoryRepository';
import { SEARCH_PATH } from '../../data/WikipediaPlaceContentRepository';
import { type DestinationCategory } from '../../domain/Destination';
import { SearchScreen } from './SearchScreen';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), replace: jest.fn(), navigate: jest.fn() },
}));

interface SetupOptions {
  readonly history?: string[];
  readonly initialQuery?: string;
  readonly initialCategory?: DestinationCategory;
  /** Scripts the APIs before the screen mounts (it loads the country catalogue straight away). */
  readonly configureApis?: (apis: ReturnType<typeof stubDiscoverApis>) => void;
}

async function setup(options: SetupOptions = {}) {
  const httpClientFactory = new FakeHttpClientFactory();
  const apis = stubDiscoverApis(httpClientFactory);
  options.configureApis?.(apis);
  const keyValueStore = new InMemoryKeyValueStore(
    options.history ? { [SEARCH_HISTORY_KEY]: JSON.stringify(options.history) } : {},
  );
  const rendered = await renderWithProviders(
    <SearchScreen
      debounceMs={20}
      initialQuery={options.initialQuery}
      initialCategory={options.initialCategory ?? null}
    />,
    { dependencies: { httpClientFactory, keyValueStore } },
  );
  return { ...apis, ...rendered, keyValueStore, user: userEvent.setup() };
}

const searchInput = () => screen.getByLabelText('Search destinations');
const wikipediaSearches = (wikipedia: ReturnType<typeof stubDiscoverApis>['wikipedia']) =>
  wikipedia.requests.filter((request) => request.path === SEARCH_PATH).map((request) => request.query?.q);

describe('SearchScreen', () => {
  beforeEach(() => jest.mocked(router.push).mockClear());

  it('invites the user to search before anything is typed', async () => {
    await setup();
    expect(await screen.findByText('Start exploring')).toBeOnTheScreen();
  });

  it('debounces typing into a single search and shows countries and cities', async () => {
    const { user, wikipedia } = await setup();

    await user.type(searchInput(), 'portu');

    expect(await screen.findByRole('button', { name: 'Portugal, Europe' })).toBeOnTheScreen();
    expect(screen.getByText('1 destination')).toBeOnTheScreen();
    // One request for the settled query, not one per keystroke.
    expect(wikipediaSearches(wikipedia)).toEqual(['portu']);
  });

  it('shows a capital as a city in its country', async () => {
    const { user } = await setup();
    await user.type(searchInput(), 'kingston');
    expect(await screen.findByRole('button', { name: 'Kingston, Capital · Jamaica' })).toBeOnTheScreen();
  });

  it('shows an empty state when nothing matches', async () => {
    const { user } = await setup();
    await user.type(searchInput(), 'zzzzqx');
    expect(await screen.findByText('No destinations found')).toBeOnTheScreen();
    expect(screen.getByText('Try another spelling or a nearby city.')).toBeOnTheScreen();
  });

  it('shows an error with retry when countries cannot be loaded, and recovers', async () => {
    const { user, restCountries } = await setup({
      configureApis: ({ restCountries: api }) => api.on('GET', '', httpFailure('server', 503)),
    });

    await user.type(searchInput(), 'portugal');

    expect(
      await screen.findByText('The service is having trouble right now. Please try again later.'),
    ).toBeOnTheScreen();

    restCountries.on('GET', '', apiSuccess(countryPage(WORLD_DTOS)));
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: 'Portugal, Europe' })).toBeOnTheScreen();
  });

  it('keeps country results and explains when Wikipedia places are unavailable', async () => {
    const { user, wikipedia } = await setup();
    wikipedia.on('GET', SEARCH_PATH, httpFailure('rateLimited', 429));

    await user.type(searchInput(), 'japan');

    expect(await screen.findByRole('button', { name: 'Japan, Asia' })).toBeOnTheScreen();
    expect(screen.getByTestId('places-unavailable')).toBeOnTheScreen();
  });

  it('includes Wikipedia places, with their country', async () => {
    const { user, wikipedia } = await setup();
    wikipedia.on(
      'GET',
      SEARCH_PATH,
      apiSuccess({ pages: [{ title: 'Nara', description: 'City in the Kansai region of Japan', thumbnail: null }] }),
    );

    await user.type(searchInput(), 'nara');

    expect(await screen.findByRole('button', { name: 'Nara, City · Japan' })).toBeOnTheScreen();
  });

  it('clears the query with the clear button', async () => {
    const { user } = await setup();
    await user.type(searchInput(), 'japan');
    await screen.findByRole('button', { name: 'Japan, Asia' });

    await user.press(screen.getByRole('button', { name: 'Clear text' }));

    expect(searchInput()).toHaveDisplayValue('');
    expect(await screen.findByText('Start exploring')).toBeOnTheScreen();
  });

  it('opens a result and remembers the search', async () => {
    const { user, store } = await setup();
    await user.type(searchInput(), 'lisbon');

    // Lisbon is both a capital and a curated destination; the curated id wins.
    await user.press(await screen.findByRole('button', { name: 'Lisbon, Capital · Portugal' }));

    expect(router.push).toHaveBeenCalledWith(routes.destination('lisbon'));
    await waitFor(() => expect(store.getState().discover.searchHistory).toEqual(['lisbon']));
  });

  describe('recent searches', () => {
    it('lists them, re-runs one on tap, and removes or clears them', async () => {
      const { user, store } = await setup({ history: ['japan', 'lisbon'] });

      expect(await screen.findByText('Recent searches')).toBeOnTheScreen();
      await user.press(screen.getByRole('button', { name: 'japan' }));
      expect(searchInput()).toHaveDisplayValue('japan');
      expect(await screen.findByRole('button', { name: 'Japan, Asia' })).toBeOnTheScreen();

      await user.press(screen.getByRole('button', { name: 'Clear text' }));
      await user.press(await screen.findByRole('button', { name: 'Remove lisbon from recent searches' }));
      await waitFor(() => expect(store.getState().discover.searchHistory).toEqual(['japan']));

      await user.press(screen.getByRole('button', { name: 'Clear recent searches' }));
      expect(await screen.findByText('Start exploring')).toBeOnTheScreen();
    });

    it('remembers a submitted search', async () => {
      const { user, store } = await setup();
      await user.type(searchInput(), 'kyoto');
      await act(async () => fireEvent(searchInput(), 'submitEditing'));
      await waitFor(() => expect(store.getState().discover.searchHistory).toEqual(['kyoto']));
    });
  });

  describe('filters', () => {
    it('browses a category without typing, and removes the filter from its chip', async () => {
      await setup({ initialCategory: 'island' });

      expect(await screen.findByRole('button', { name: /^Santorini,/ })).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: /^Kyoto,/ })).toBeNull();
      expect(screen.getByRole('button', { name: 'Filters (1)' })).toBeOnTheScreen();

      await userEvent.setup().press(screen.getByRole('button', { name: 'Remove filter: Islands' }));
      expect(await screen.findByText('Start exploring')).toBeOnTheScreen();
    });

    it('applies filters chosen in the sheet', async () => {
      const { user } = await setup();
      await screen.findByText('Start exploring');

      await user.press(screen.getByRole('button', { name: 'Filters' }));
      await user.press(await screen.findByRole('button', { name: 'Asia' }));
      await user.press(screen.getByRole('button', { name: 'Over 100 million' }));
      await user.press(screen.getByRole('button', { name: 'Show results' }));

      expect(await screen.findByRole('button', { name: 'Filters (2)' })).toBeOnTheScreen();
      // Browsing by filters alone: the large Asian country and a curated city in it.
      expect(await screen.findByRole('button', { name: 'Japan, Asia' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: /^Kyoto,/ })).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Georgia, Asia' })).toBeNull();
    });

    it('offers to clear filters when they hide every result', async () => {
      const { user } = await setup({ initialQuery: 'portugal', initialCategory: 'island' });

      expect(await screen.findByText('Try another spelling, or remove a filter.')).toBeOnTheScreen();
      await user.press(screen.getByRole('button', { name: 'Clear filters' }));

      expect(await screen.findByRole('button', { name: 'Portugal, Europe' })).toBeOnTheScreen();
    });
  });
});
