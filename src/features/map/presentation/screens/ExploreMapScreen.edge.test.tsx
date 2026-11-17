import { act, fireEvent, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import type * as ReactModule from 'react';
import type * as ReactNativeModule from 'react-native';
import { Linking } from 'react-native';

import { ok } from '@/core/result';
import { type LocationPermission } from '@/features/weather/domain/repositories';
import { captureAppState } from '@/testing/captureAppState';
import { httpFailure } from '@/testing/discoverFixtures';
import { apiSuccess, type FakeHttpClient, FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { FakeLocationService } from '@/testing/FakeLocationService';
import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { ManualClock } from '@/testing/ManualClock';
import { stubNominatim, stubOverpass } from '@/testing/mapFixtures';
import { renderWithProviders } from '@/testing/renderWithProviders';

import { NOMINATIM_SEARCH_PATH } from '../../data/osmApis';
import { CUSTOM_MARKERS_KEY } from '../../data/StorageCustomMarkerRepository';
import { MAP_CACHE_SECONDS } from '../state/mapApi';
import { ExploreMapScreen } from './ExploreMapScreen';

// A map mock whose camera calls can be asserted (the shared mock recreates its jest.fn on every render).
const mockAnimateToRegion = jest.fn();
jest.mock('react-native-maps', () => {
  const React = jest.requireActual<typeof ReactModule>('react');
  const { View } = jest.requireActual<typeof ReactNativeModule>('react-native');
  const MapView = React.forwardRef<unknown, Record<string, unknown>>(function MockMapView(props, ref) {
    React.useImperativeHandle(ref, () => ({
      animateToRegion: (...args: unknown[]) => mockAnimateToRegion(...args),
    }));
    return React.createElement(View, props);
  });
  const Marker = (props: Record<string, unknown>) => React.createElement(View, props);
  return { __esModule: true, default: MapView, MapView, Marker };
});

const START = 1_800_000_000_000;
const RESTAURANT_MARKER = 'place-marker-osm:node/102';
const MUSEUM_MARKER = 'place-marker-osm:node/101';
const DEVICE_REGION = expect.objectContaining({ latitude: 48.858372, longitude: 2.294481 });
const LOUVRE_REGION = expect.objectContaining({ latitude: 48.8611473, longitude: 2.3380277 });
/** Where the traveller has walked to while the map stayed open. */
const MONTMARTRE = { latitude: 48.886705, longitude: 2.343104 };
const MONTMARTRE_REGION = expect.objectContaining(MONTMARTRE);
const POSITION_FRESH_FOR = MAP_CACHE_SECONDS.currentLocation * 1000;

const map = () => screen.getByTestId('explore-map');
const mapReady = async () => fireEvent(await screen.findByTestId('explore-map'), 'mapReady');
const pinMarkers = () => screen.queryAllByTestId(/^custom-marker-/);
const searchInput = () => screen.getByLabelText('Search places');

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

interface Fakes {
  readonly overpass: FakeHttpClient;
  readonly nominatim: FakeHttpClient;
  readonly location: FakeLocationService;
}

async function setup({
  permission = 'granted' as LocationPermission,
  keyValueStore = new InMemoryKeyValueStore(),
  configure,
}: {
  permission?: LocationPermission;
  keyValueStore?: InMemoryKeyValueStore;
  configure?: (fakes: Fakes) => void;
} = {}) {
  const httpClientFactory = new FakeHttpClientFactory();
  const overpass = stubOverpass(httpClientFactory);
  const nominatim = stubNominatim(httpClientFactory);
  const location = new FakeLocationService();
  location.permission = permission;
  const clock = new ManualClock(START);
  configure?.({ overpass, nominatim, location });
  await renderWithProviders(<ExploreMapScreen />, {
    dependencies: { httpClientFactory, mapLocationService: location, clock, keyValueStore },
  });
  return { overpass, nominatim, location, clock, keyValueStore };
}

beforeEach(() => mockAnimateToRegion.mockClear());
afterEach(() => jest.restoreAllMocks());

describe('ExploreMapScreen recentring', () => {
  it('waits for the map to be ready before moving to a position that arrived first', async () => {
    await setup();
    await screen.findByTestId(RESTAURANT_MARKER);
    expect(mockAnimateToRegion).not.toHaveBeenCalled();

    await mapReady();

    expect(mockAnimateToRegion).toHaveBeenCalledTimes(1);
    expect(mockAnimateToRegion).toHaveBeenCalledWith(DEVICE_REGION, expect.any(Number));
  });

  it('"My location" moves the camera back to the device after the user panned away, even with no search active', async () => {
    await setup();
    const user = userEvent.setup();
    await mapReady();
    await screen.findByTestId(RESTAURANT_MARKER);
    await waitFor(() => expect(mockAnimateToRegion).toHaveBeenCalledWith(DEVICE_REGION, expect.any(Number)));
    mockAnimateToRegion.mockClear();

    await user.press(screen.getByRole('button', { name: 'My location' }));

    expect(mockAnimateToRegion).toHaveBeenCalledWith(DEVICE_REGION, expect.any(Number));
  });

  it('"My location" with a fresh position recentres without reading the position again', async () => {
    const { location, clock } = await setup();
    const user = userEvent.setup();
    await mapReady();
    await screen.findByTestId(RESTAURANT_MARKER);

    clock.advance(POSITION_FRESH_FOR - 1);
    await user.press(screen.getByRole('button', { name: 'My location' }));

    expect(mockAnimateToRegion).toHaveBeenLastCalledWith(DEVICE_REGION, expect.any(Number));
    expect(location.getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('"My location" with an old position reads it again and follows the traveller', async () => {
    const { location, overpass, clock } = await setup();
    const user = userEvent.setup();
    await mapReady();
    await screen.findByTestId(RESTAURANT_MARKER);

    location.position = ok(MONTMARTRE);
    clock.advance(POSITION_FRESH_FOR);
    await user.press(screen.getByRole('button', { name: 'My location' }));

    await waitFor(() => expect(mockAnimateToRegion).toHaveBeenLastCalledWith(MONTMARTRE_REGION, expect.any(Number)));
    expect(location.getCurrentPosition).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(overpass.requests).toHaveLength(2));
  });

  it('picking the same search result again moves the camera back to it', async () => {
    const { clock } = await setup();
    const user = userEvent.setup();
    await mapReady();
    await screen.findByTestId(RESTAURANT_MARKER);

    await user.type(searchInput(), 'Louvre', { submitEditing: true });
    clock.advance(2_000);
    await user.press(await screen.findByRole('button', { name: /Louvre Museum/ }));
    await waitFor(() => expect(mockAnimateToRegion).toHaveBeenCalledWith(LOUVRE_REGION, expect.any(Number)));
    mockAnimateToRegion.mockClear();

    fireEvent(searchInput(), 'submitEditing');
    await user.press(await screen.findByRole('button', { name: /Louvre Museum/ }));

    expect(mockAnimateToRegion).toHaveBeenCalledWith(LOUVRE_REGION, expect.any(Number));
  });
});

describe('ExploreMapScreen permission while viewing a search result', () => {
  it.each(['undetermined', 'blocked'] as const)(
    'keeps the location permission card reachable after picking a result with %s permission',
    async (permission) => {
      await setup({ permission });
      const user = userEvent.setup();
      const action = permission === 'blocked' ? 'Open Settings' : 'Use my location';
      await screen.findByRole('button', { name: action });

      await user.type(searchInput(), 'Louvre', { submitEditing: true });
      await user.press(await screen.findByRole('button', { name: /Louvre Museum/ }));
      await screen.findByTestId('search-marker');

      expect(screen.getByRole('button', { name: action })).toBeOnTheScreen();
    },
  );

  it('granting permission from a search result keeps the result centred and offers "My location"', async () => {
    const { overpass } = await setup({ permission: 'undetermined' });
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Use my location' });
    await user.type(searchInput(), 'Louvre', { submitEditing: true });
    await user.press(await screen.findByRole('button', { name: /Louvre Museum/ }));
    await screen.findByTestId('search-marker');

    await user.press(screen.getByRole('button', { name: 'Use my location' }));

    expect(await screen.findByRole('button', { name: 'My location' })).toBeOnTheScreen();
    expect(screen.getByTestId('search-marker')).toBeOnTheScreen();
    expect(overpass.requests).toHaveLength(1);
  });
});

describe('ExploreMapScreen lifecycle', () => {
  let appState: ReturnType<typeof captureAppState>;
  beforeEach(() => {
    appState = captureAppState();
  });
  afterEach(() => appState.restore());

  it('shows the permission card again when access is revoked in Settings while the map was located', async () => {
    const { location } = await setup();
    await screen.findByTestId(RESTAURANT_MARKER);

    location.permission = 'denied';
    await appState.foreground();

    expect(await screen.findByRole('button', { name: 'Use my location' })).toBeOnTheScreen();
  });

  it('does not read the position again on a return inside the position cache window', async () => {
    const { location, overpass, clock } = await setup();
    await screen.findByTestId(RESTAURANT_MARKER);

    clock.advance(POSITION_FRESH_FOR - 1);
    await appState.foreground();
    await act(async () => new Promise<void>((resolve) => setTimeout(resolve, 0)));

    expect(location.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(overpass.requests).toHaveLength(1);
  });

  it('reads an old position again on return, then moves the camera and the nearby places to the new spot', async () => {
    const { location, overpass, clock } = await setup();
    await mapReady();
    await screen.findByTestId(RESTAURANT_MARKER);

    location.position = ok(MONTMARTRE);
    clock.advance(POSITION_FRESH_FOR);
    await appState.foreground();

    await waitFor(() => expect(mockAnimateToRegion).toHaveBeenLastCalledWith(MONTMARTRE_REGION, expect.any(Number)));
    expect(location.getCurrentPosition).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(overpass.requests).toHaveLength(2));
  });

  describe('with fake timers', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('does not report the map as failed when the app spent the ready timeout in the background', async () => {
      await setup({ permission: 'undetermined' });
      expect(await screen.findByTestId('explore-map')).toBeOnTheScreen();

      await appState.send('background');
      await act(async () => {
        await jest.advanceTimersByTimeAsync(60_000);
      });
      await appState.send('active');

      expect(screen.queryByText("Map couldn't load")).toBeNull();
      fireEvent(map(), 'mapReady');
      await act(async () => {
        await jest.advanceTimersByTimeAsync(20_000);
      });
      expect(screen.queryByText("Map couldn't load")).toBeNull();
    });

    it('still reports the map as failed when it stays unready for 15 s in the foreground after returning', async () => {
      await setup({ permission: 'undetermined' });
      await screen.findByTestId('explore-map');

      await appState.send('background', 'active');
      await act(async () => {
        await jest.advanceTimersByTimeAsync(15_000);
      });

      expect(screen.getByText("Map couldn't load")).toBeOnTheScreen();
    });
  });
});

describe('ExploreMapScreen search edge cases', () => {
  it('treats a whitespace-only query as too short and sends nothing', async () => {
    const { nominatim } = await setup({ permission: 'undetermined' });
    const user = userEvent.setup();

    await user.type(searchInput(), '   ', { submitEditing: true });

    expect(await screen.findByText(/at least 2 characters/i)).toBeOnTheScreen();
    expect(nominatim.requests).toHaveLength(0);
  });

  it('asks Nominatim again when the same query is resubmitted after a failure', async () => {
    const { nominatim, clock } = await setup({
      permission: 'undetermined',
      configure: ({ nominatim }) => nominatim.on('GET', NOMINATIM_SEARCH_PATH, httpFailure('offline')),
    });
    const user = userEvent.setup();

    await user.type(searchInput(), 'Louvre', { submitEditing: true });
    expect(await screen.findByText('Connect to the internet and try again.')).toBeOnTheScreen();

    nominatim.on('GET', NOMINATIM_SEARCH_PATH, apiSuccess([]));
    clock.advance(1_000);
    fireEvent(searchInput(), 'submitEditing');

    expect(await screen.findByText(/No places match .Louvre./)).toBeOnTheScreen();
    expect(nominatim.requests).toHaveLength(2);
  });

  it('serves a resubmitted successful query from the cache without a new request', async () => {
    const { nominatim } = await setup({ permission: 'undetermined' });
    const user = userEvent.setup();

    await user.type(searchInput(), 'Louvre', { submitEditing: true });
    await screen.findByRole('button', { name: /Louvre Museum/ });
    await user.press(screen.getByRole('button', { name: 'Close search results' }));
    fireEvent(searchInput(), 'submitEditing');

    expect(await screen.findByRole('button', { name: /Louvre Museum/ })).toBeOnTheScreen();
    expect(nominatim.requests).toHaveLength(1);
  });
});

class FailingWriteStore extends InMemoryKeyValueStore {
  override async setItem(): Promise<void> {
    throw new Error('disk full');
  }
}

class SlowReadStore extends InMemoryKeyValueStore {
  readonly gate = deferred<void>();
  override async getItem(key: string): Promise<string | null> {
    if (key === CUSTOM_MARKERS_KEY) await this.gate.promise;
    return super.getItem(key);
  }
}

describe('ExploreMapScreen pin edge cases', () => {
  it('says the pin could not be saved, and shows no pin, when storage refuses the write', async () => {
    await setup({ permission: 'undetermined', keyValueStore: new FailingWriteStore() });
    await waitFor(() => expect(map()).toBeOnTheScreen());
    await act(async () => undefined);

    fireEvent(map(), 'longPress', { nativeEvent: { coordinate: { latitude: 48.86, longitude: 2.3 } } });

    expect(await screen.findByText("We couldn't save your pins on this device.")).toBeOnTheScreen();
    expect(pinMarkers()).toHaveLength(0);
  });

  it('ignores a long press made before saved pins are read, so stored pins are never overwritten', async () => {
    const saved = [{ id: 'p1', coordinates: { latitude: 48.87, longitude: 2.31 }, createdAt: START - 1 }];
    const keyValueStore = new SlowReadStore({ [CUSTOM_MARKERS_KEY]: JSON.stringify(saved) });
    await setup({ permission: 'undetermined', keyValueStore });
    await screen.findByTestId('explore-map');

    fireEvent(map(), 'longPress', { nativeEvent: { coordinate: { latitude: 48.86, longitude: 2.3 } } });
    await act(async () => keyValueStore.gate.resolve());

    await waitFor(() => expect(pinMarkers()).toHaveLength(1));
    expect(JSON.parse(keyValueStore.data.get(CUSTOM_MARKERS_KEY) ?? '[]')).toEqual(saved);
  });
});

describe('ExploreMapScreen directions double tap', () => {
  it('opens the maps app once when Directions is tapped twice while the first open is on its way', async () => {
    const opened = deferred<void>();
    const openURL = jest.spyOn(Linking, 'openURL').mockImplementation(() => opened.promise);
    await setup();

    fireEvent.press(await screen.findByTestId(MUSEUM_MARKER));
    const sheet = await screen.findByTestId('place-sheet');
    const directions = within(sheet).getByRole('button', { name: 'Directions' });
    fireEvent.press(directions);
    fireEvent.press(directions);
    await act(async () => opened.resolve());

    expect(openURL).toHaveBeenCalledTimes(1);
  });
});
