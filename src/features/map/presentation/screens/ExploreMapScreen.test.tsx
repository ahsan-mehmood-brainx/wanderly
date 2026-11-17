import { act, fireEvent, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { AppError } from '@/core/errors/AppError';
import { err, ok } from '@/core/result';
import { type LocationPermission } from '@/features/weather/domain/repositories';
import { captureAppState } from '@/testing/captureAppState';
import { httpFailure } from '@/testing/discoverFixtures';
import { FakeConnectivityService, OFFLINE, ONLINE } from '@/testing/FakeConnectivityService';
import { apiSuccess, type FakeHttpClient, FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { FAKE_MAP_POSITION, FakeLocationService } from '@/testing/FakeLocationService';
import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { ManualClock } from '@/testing/ManualClock';
import { overpassNode, overpassResponse, PARIS_ELEMENTS, stubNominatim, stubOverpass } from '@/testing/mapFixtures';
import { renderWithProviders } from '@/testing/renderWithProviders';

import { NOMINATIM_SEARCH_PATH, OVERPASS_INTERPRETER_PATH } from '../../data/osmApis';
import { CUSTOM_MARKERS_KEY } from '../../data/StorageCustomMarkerRepository';
import { ExploreMapScreen } from './ExploreMapScreen';

const START = 1_800_000_000_000;
/** Overpass requests are at least 2 s apart (and Nominatim 1 s): tests move the clock past that before the next one. */
const OVERPASS_SPACING_MS = 2_000;

const MUSEUM_MARKER = 'place-marker-osm:node/101';
const RESTAURANT_MARKER = 'place-marker-osm:node/102';
const CATEGORY_LABELS = ['Attractions', 'Restaurants', 'Hotels', 'Museums', 'Parks', 'Landmarks'];

const map = () => screen.getByTestId('explore-map');
const placeMarkers = () => screen.queryAllByTestId(/^place-marker-/);
const pinMarkers = () => screen.queryAllByTestId(/^custom-marker-/);
const searchInput = () => screen.getByLabelText('Search places');
const storedPins = (store: InMemoryKeyValueStore): unknown[] =>
  JSON.parse(store.data.get(CUSTOM_MARKERS_KEY) ?? '[]') as unknown[];

interface Fakes {
  readonly overpass: FakeHttpClient;
  readonly nominatim: FakeHttpClient;
  readonly location: FakeLocationService;
}

interface SetupOptions {
  readonly permission?: LocationPermission;
  readonly configure?: (fakes: Fakes) => void;
  readonly keyValueStore?: InMemoryKeyValueStore;
  readonly connectivity?: FakeConnectivityService;
}

async function setup({
  permission = 'granted',
  configure,
  keyValueStore = new InMemoryKeyValueStore(),
  connectivity = new FakeConnectivityService(),
}: SetupOptions = {}) {
  const httpClientFactory = new FakeHttpClientFactory();
  const overpass = stubOverpass(httpClientFactory);
  const nominatim = stubNominatim(httpClientFactory);
  const location = new FakeLocationService();
  location.permission = permission;
  const clock = new ManualClock(START);
  configure?.({ overpass, nominatim, location });
  const rendered = await renderWithProviders(<ExploreMapScreen />, {
    dependencies: { httpClientFactory, mapLocationService: location, clock, keyValueStore, connectivity },
  });
  return { ...rendered, overpass, nominatim, location, clock, keyValueStore, connectivity };
}

const pin = (id: string, latitude: number, longitude: number) => ({
  id,
  coordinates: { latitude, longitude },
  createdAt: START - 1_000,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

afterEach(() => jest.restoreAllMocks());

describe('ExploreMapScreen location permission', () => {
  it.each(['undetermined', 'denied'] as const)(
    'AC2 explains first, and asks for %s permission only when "Use my location" is tapped',
    async (permission) => {
      const { location, overpass } = await setup({ permission });
      const user = userEvent.setup();

      const allow = await screen.findByRole('button', { name: 'Use my location' });
      expect(location.requestPermission).not.toHaveBeenCalled();
      expect(location.getCurrentPosition).not.toHaveBeenCalled();
      expect(overpass.requests).toHaveLength(0);

      await user.press(allow);

      expect(await screen.findByTestId(RESTAURANT_MARKER)).toBeOnTheScreen();
      expect(location.requestPermission).toHaveBeenCalledTimes(1);
      expect(overpass.requests).toHaveLength(1);
    },
  );

  it('AC2 asks only once when "Use my location" is tapped twice', async () => {
    const answer = deferred<LocationPermission>();
    const { location } = await setup({
      permission: 'undetermined',
      configure: ({ location }) => location.requestPermission.mockImplementationOnce(() => answer.promise),
    });

    const allow = await screen.findByRole('button', { name: 'Use my location' });
    fireEvent.press(allow);
    fireEvent.press(allow);
    expect(location.requestPermission).toHaveBeenCalledTimes(1);

    location.permission = 'granted';
    await act(async () => answer.resolve('granted'));

    expect(await screen.findByTestId(RESTAURANT_MARKER)).toBeOnTheScreen();
    expect(location.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('AC2 offers Open Settings when permission is blocked, and says so if Settings cannot open', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockRejectedValueOnce(new Error('no settings'));
    const { location, overpass } = await setup({ permission: 'blocked' });
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'Open Settings' }));

    expect(await screen.findByText(/couldn't open Settings/i)).toBeOnTheScreen();
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(location.requestPermission).not.toHaveBeenCalled();
    expect(overpass.requests).toHaveLength(0);
  });

  it('AC2 locates the device, shows it on the map and loads nearby places once when permission is granted', async () => {
    const { location, overpass } = await setup();

    expect(await screen.findByTestId(RESTAURANT_MARKER)).toBeOnTheScreen();
    expect(placeMarkers()).toHaveLength(PARIS_ELEMENTS.length);
    expect(map()).toHaveProp('showsUserLocation', true);
    expect(overpass.requests).toHaveLength(1);
    expect(String(overpass.requests[0]?.query?.data)).toContain('around:1500,48.858,2.294');
    expect(location.requestPermission).not.toHaveBeenCalled();
    expect(screen.getByText(/© OpenStreetMap contributors/)).toBeOnTheScreen();
  });

  it('AC2 keeps search working without location permission', async () => {
    const { nominatim, overpass } = await setup({ permission: 'blocked' });
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Open Settings' });

    await user.type(searchInput(), 'Louvre', { submitEditing: true });
    await user.press(await screen.findByRole('button', { name: /Louvre Museum/ }));

    expect(await screen.findByTestId('search-marker')).toBeOnTheScreen();
    expect(nominatim.requests).toHaveLength(1);
    expect(overpass.requests).toHaveLength(1);
    expect(String(overpass.requests[0]?.query?.data)).toContain('around:1500,48.861,2.338');
  });
});

describe('ExploreMapScreen back in the foreground', () => {
  let appState: ReturnType<typeof captureAppState>;
  beforeEach(() => {
    appState = captureAppState();
  });
  afterEach(() => appState.restore());

  it('AC2 re-checks permission on return and loads places once access was granted in Settings', async () => {
    const { location, overpass } = await setup({ permission: 'blocked' });
    await screen.findByRole('button', { name: 'Open Settings' });

    location.permission = 'granted';
    await appState.foreground();

    expect(await screen.findByTestId(RESTAURANT_MARKER)).toBeOnTheScreen();
    expect(overpass.requests).toHaveLength(1);
  });
});

describe('ExploreMapScreen device position', () => {
  it('AC3 says location services are off, with a retry, and loads no places', async () => {
    const { location, overpass } = await setup({
      configure: ({ location }) => {
        location.position = err(new AppError('locationServicesDisabled', 'services off'));
      },
    });
    const user = userEvent.setup();

    expect(await screen.findByText(/Location services are off/)).toBeOnTheScreen();
    expect(overpass.requests).toHaveLength(0);

    location.position = ok(FAKE_MAP_POSITION);
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByTestId(RESTAURANT_MARKER)).toBeOnTheScreen();
  });

  it.each([
    ['no fix arrives', err(new AppError('locationUnavailable', 'no fix'))],
    ['the fix is 0,0', ok({ latitude: 0, longitude: 0 })],
    ['the fix is out of range', ok({ latitude: 48.85, longitude: 200 })],
  ])("AC3 says it couldn't find the location when %s, and sends no places request", async (_label, position) => {
    const { overpass } = await setup({
      configure: ({ location }) => {
        location.position = position;
      },
    });

    expect(await screen.findByText(/couldn't find your location/i)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    expect(overpass.requests).toHaveLength(0);
  });
});

describe('ExploreMapScreen filters', () => {
  it('AC6 starts with every category selected and filters markers without a new request', async () => {
    const { overpass } = await setup();
    const user = userEvent.setup();
    await screen.findByTestId(RESTAURANT_MARKER);

    for (const label of CATEGORY_LABELS) {
      expect(screen.getByRole('button', { name: label, selected: true })).toBeOnTheScreen();
    }

    await user.press(screen.getByRole('button', { name: 'Restaurants' }));

    expect(screen.getByRole('button', { name: 'Restaurants', selected: false })).toBeOnTheScreen();
    expect(screen.queryByTestId(RESTAURANT_MARKER)).toBeNull();
    expect(placeMarkers()).toHaveLength(PARIS_ELEMENTS.length - 1);

    await user.press(screen.getByRole('button', { name: 'Restaurants' }));

    expect(screen.getByTestId(RESTAURANT_MARKER)).toBeOnTheScreen();
    expect(overpass.requests).toHaveLength(1);
  });

  it('AC6 asks for a category when every chip is off', async () => {
    const { overpass } = await setup();
    const user = userEvent.setup();
    await screen.findByTestId(RESTAURANT_MARKER);

    for (const label of CATEGORY_LABELS) await user.press(screen.getByRole('button', { name: label }));

    expect(screen.getByText('Select at least one category')).toBeOnTheScreen();
    expect(placeMarkers()).toHaveLength(0);
    expect(overpass.requests).toHaveLength(1);
  });

  it('AC6 says when the area has no places at all', async () => {
    await setup({
      configure: ({ overpass }) => overpass.on('GET', OVERPASS_INTERPRETER_PATH, apiSuccess(overpassResponse([]))),
    });

    expect(await screen.findByText('No places found nearby')).toBeOnTheScreen();
    expect(placeMarkers()).toHaveLength(0);
  });
});

describe('ExploreMapScreen search', () => {
  it('AC7 searches only on submit, then moves to the picked result, loads places around it and can return', async () => {
    const { nominatim, overpass, clock } = await setup();
    const user = userEvent.setup();
    await screen.findByTestId(RESTAURANT_MARKER);

    await user.type(searchInput(), 'Louvre');
    expect(nominatim.requests).toHaveLength(0);

    fireEvent(searchInput(), 'submitEditing', { nativeEvent: { text: 'Louvre' } });
    const result = await screen.findByRole('button', { name: /Louvre Museum/ });
    expect(nominatim.requests).toHaveLength(1);
    expect(nominatim.requests[0]?.query).toMatchObject({ q: 'Louvre', format: 'jsonv2', limit: 5 });

    overpass.on(
      'GET',
      OVERPASS_INTERPRETER_PATH,
      apiSuccess(
        overpassResponse([overpassNode(201, 48.8606, 2.3376, { name: 'Musée du Louvre', tourism: 'museum' })]),
      ),
    );
    clock.advance(OVERPASS_SPACING_MS);
    await user.press(result);

    expect(await screen.findByTestId('place-marker-osm:node/201')).toBeOnTheScreen();
    expect(screen.getByTestId('search-marker')).toBeOnTheScreen();
    expect(overpass.requests).toHaveLength(2);
    expect(String(overpass.requests[1]?.query?.data)).toContain('around:1500,48.861,2.338');

    await user.press(screen.getByRole('button', { name: 'My location' }));

    expect(await screen.findByTestId(RESTAURANT_MARKER)).toBeOnTheScreen();
    expect(screen.queryByTestId('search-marker')).toBeNull();
    expect(overpass.requests).toHaveLength(2);
  });

  it('AC7 says when nothing matches the query', async () => {
    await setup({ configure: ({ nominatim }) => nominatim.on('GET', NOMINATIM_SEARCH_PATH, apiSuccess([])) });
    const user = userEvent.setup();

    await user.type(searchInput(), 'zzqx', { submitEditing: true });

    expect(await screen.findByText(/No places match .zzqx./)).toBeOnTheScreen();
  });

  it('AC7 asks for a longer query instead of searching with one character', async () => {
    const { nominatim } = await setup();
    const user = userEvent.setup();

    await user.type(searchInput(), 'a', { submitEditing: true });

    expect(await screen.findByText(/at least 2 characters/i)).toBeOnTheScreen();
    expect(nominatim.requests).toHaveLength(0);
  });
});

describe('ExploreMapScreen failures and connectivity', () => {
  it.each([
    ['offline', undefined, 'Connect to the internet and try again.'],
    ['network', undefined, "We couldn't reach the server. Check your connection and try again."],
    ['timeout', undefined, 'This is taking longer than expected. Please try again.'],
    ['rateLimited', 429, 'Too many requests right now. Please wait a moment and try again.'],
    ['server', 503, 'The service is having trouble right now. Please try again later.'],
  ] as const)('AC8 shows the %s message with a retry that recovers', async (kind, status, message) => {
    const { overpass, clock } = await setup({
      configure: ({ overpass }) => overpass.on('GET', OVERPASS_INTERPRETER_PATH, httpFailure(kind, status)),
    });
    const user = userEvent.setup();

    expect(await screen.findByText(message)).toBeOnTheScreen();

    overpass.on('GET', OVERPASS_INTERPRETER_PATH, apiSuccess(overpassResponse(PARIS_ELEMENTS)));
    clock.advance(31_000);
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByTestId(RESTAURANT_MARKER)).toBeOnTheScreen();
  });

  it('AC8 keeps the places already on the map visible when a later load fails', async () => {
    const { overpass, clock } = await setup();
    const user = userEvent.setup();
    await screen.findByTestId(RESTAURANT_MARKER);

    await user.type(searchInput(), 'Louvre', { submitEditing: true });
    const result = await screen.findByRole('button', { name: /Louvre Museum/ });
    overpass.on('GET', OVERPASS_INTERPRETER_PATH, httpFailure('rateLimited', 429));
    clock.advance(OVERPASS_SPACING_MS);
    await user.press(result);

    expect(
      await screen.findByText('Too many requests right now. Please wait a moment and try again.'),
    ).toBeOnTheScreen();
    expect(screen.getByTestId(RESTAURANT_MARKER)).toBeOnTheScreen();
  });

  it('AC8 reloads places by itself when the connection comes back', async () => {
    const connectivity = new FakeConnectivityService(OFFLINE);
    const { overpass, clock } = await setup({
      connectivity,
      configure: ({ overpass }) => overpass.on('GET', OVERPASS_INTERPRETER_PATH, httpFailure('offline')),
    });

    expect(await screen.findByText('Connect to the internet and try again.')).toBeOnTheScreen();

    overpass.on('GET', OVERPASS_INTERPRETER_PATH, apiSuccess(overpassResponse(PARIS_ELEMENTS)));
    clock.advance(OVERPASS_SPACING_MS);
    await act(async () => connectivity.set(ONLINE));

    expect(await screen.findByTestId(RESTAURANT_MARKER)).toBeOnTheScreen();
  });
});

describe('ExploreMapScreen place details and directions', () => {
  it('AC9 shows a place in the sheet and opens directions in Apple Maps', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await setup();
    const user = userEvent.setup();

    fireEvent.press(await screen.findByTestId(MUSEUM_MARKER));

    const sheet = await screen.findByTestId('place-sheet');
    expect(within(sheet).getByText('Musée du quai Branly')).toBeOnTheScreen();
    expect(within(sheet).getByText(/^Museums?$/)).toBeOnTheScreen();
    expect(within(sheet).getByText(/\d\s?(m|km)\b/)).toBeOnTheScreen();
    expect(within(sheet).getByText(/Quai Jacques Chirac/)).toBeOnTheScreen();
    expect(within(sheet).getByText(/Tu-Su 10:30-19:00/)).toBeOnTheScreen();
    expect(within(sheet).getByText(/quaibranly\.fr/)).toBeOnTheScreen();

    await user.press(within(sheet).getByRole('button', { name: 'Directions' }));

    expect(openURL).toHaveBeenCalledWith(
      'https://maps.apple.com/?daddr=48.8611,2.2978&q=Mus%C3%A9e%20du%20quai%20Branly',
    );
  });

  it('AC9 says when no maps app can open, after trying the web fallback', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('No app can open it'));
    await setup();
    const user = userEvent.setup();

    fireEvent.press(await screen.findByTestId(MUSEUM_MARKER));
    await user.press(within(await screen.findByTestId('place-sheet')).getByRole('button', { name: 'Directions' }));

    expect(await screen.findByText("Couldn't open a maps app")).toBeOnTheScreen();
    expect(openURL.mock.calls.map(([url]) => url)).toEqual([
      'https://maps.apple.com/?daddr=48.8611,2.2978&q=Mus%C3%A9e%20du%20quai%20Branly',
      'https://www.google.com/maps/dir/?api=1&destination=48.8611,2.2978',
    ]);
  });
});

describe('ExploreMapScreen custom pins', () => {
  it('AC10 drops a pin on long press, saves it, and removes it from its sheet', async () => {
    const keyValueStore = new InMemoryKeyValueStore();
    await setup({ keyValueStore });
    const user = userEvent.setup();
    await screen.findByTestId(RESTAURANT_MARKER);

    fireEvent(map(), 'longPress', { nativeEvent: { coordinate: { latitude: 48.86, longitude: 2.3 } } });

    await waitFor(() => expect(pinMarkers()).toHaveLength(1));
    await waitFor(() =>
      expect(storedPins(keyValueStore)).toEqual([
        expect.objectContaining({ coordinates: { latitude: 48.86, longitude: 2.3 } }),
      ]),
    );

    fireEvent.press(pinMarkers()[0]!);
    const sheet = await screen.findByTestId('place-sheet');
    expect(within(sheet).getByText('48.86000, 2.30000')).toBeOnTheScreen();
    expect(within(sheet).getByRole('button', { name: 'Directions' })).toBeOnTheScreen();

    await user.press(within(sheet).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(pinMarkers()).toHaveLength(0));
    await waitFor(() => expect(storedPins(keyValueStore)).toEqual([]));
  });

  it('AC10 restores saved pins after a restart, dropping corrupt entries', async () => {
    const keyValueStore = new InMemoryKeyValueStore({
      [CUSTOM_MARKERS_KEY]: JSON.stringify([
        pin('p1', 48.86, 2.3),
        { id: 'broken', coordinates: { latitude: 'north' } },
        pin('p2', 48.87, 2.31),
      ]),
    });

    await setup({ permission: 'undetermined', keyValueStore });

    await waitFor(() => expect(pinMarkers()).toHaveLength(2));
  });

  it('AC10 refuses a pin beyond 50, keeping the saved ones', async () => {
    const keyValueStore = new InMemoryKeyValueStore({
      [CUSTOM_MARKERS_KEY]: JSON.stringify(
        Array.from({ length: 50 }, (_, index) => pin(`p${index}`, 48.8 + index / 1_000, 2.3)),
      ),
    });
    await setup({ permission: 'undetermined', keyValueStore });
    await waitFor(() => expect(pinMarkers()).toHaveLength(50));

    fireEvent(map(), 'longPress', { nativeEvent: { coordinate: { latitude: 48.9, longitude: 2.4 } } });

    expect(await screen.findByText('You can save up to 50 pins')).toBeOnTheScreen();
    expect(pinMarkers()).toHaveLength(50);
    expect(storedPins(keyValueStore)).toHaveLength(50);
  });
});

describe('ExploreMapScreen map loading', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('AC10 shows "Map couldn\'t load" when the map isn\'t ready within 15 s, and Try again remounts it', async () => {
    await setup({ permission: 'undetermined' });
    expect(await screen.findByTestId('explore-map')).toBeOnTheScreen();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(15_000);
    });

    expect(screen.getByText("Map couldn't load")).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.queryByText("Map couldn't load")).toBeNull();
    expect(map()).toBeOnTheScreen();
  });

  it('AC10 keeps the map once it reports ready in time', async () => {
    await setup({ permission: 'undetermined' });
    fireEvent(await screen.findByTestId('explore-map'), 'mapReady');

    await act(async () => {
      await jest.advanceTimersByTimeAsync(20_000);
    });

    expect(screen.queryByText("Map couldn't load")).toBeNull();
    expect(map()).toBeOnTheScreen();
  });
});
