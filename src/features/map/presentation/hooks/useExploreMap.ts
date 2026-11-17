import { skipToken } from '@reduxjs/toolkit/query/react';
import Constants from 'expo-constants';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Platform } from 'react-native';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { type AppErrorKind } from '@/core/errors/AppError';
import { useAppDispatch, useAppSelector } from '@/core/store/hooks';
import { type Coordinates } from '@/features/weather/domain/Coordinates';
import { useConnectivity } from '@/shared/hooks/useConnectivity';
import { openExternalUrl } from '@/shared/navigation/openExternalUrl';

import { buildDirectionsUrls } from '../../domain/directions';
import { filterPlaces } from '../../domain/filterPlaces';
import { formatPinLabel } from '../../domain/geo';
import {
  type CustomMarker,
  type LocationSearchResult,
  type Place,
  PLACE_CATEGORIES,
  type PlaceCategory,
  SEARCH_QUERY_MIN,
} from '../../domain/Place';
import { isMapAvailable } from '../mapAvailability';
import { mapErrorKind, useNearbyPlacesQuery, useSearchLocationsQuery } from '../state/mapApi';
import {
  addCustomMarker,
  dismissMapNotice,
  loadCustomMarkers,
  type MapNotice,
  removeCustomMarker,
} from '../state/mapSlice';
import { selectCustomMarkers, selectMapNotice } from '../state/selectors';
import { type MapLocationState, useMapLocation } from './useMapLocation';

/** iOS reports `onMapReady` once tiles can draw; after this long the map is treated as failed. */
export const MAP_READY_TIMEOUT_MS = 15_000;

export type PlacesState =
  /** No centre yet (no permission, no search result). */
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready' }
  | { readonly status: 'empty' }
  | { readonly status: 'noCategories' }
  | { readonly status: 'error'; readonly errorKind: AppErrorKind; readonly retry: () => void };

export type SearchState =
  | { readonly status: 'idle' }
  | { readonly status: 'tooShort' }
  | { readonly status: 'loading' }
  | { readonly status: 'results'; readonly results: readonly LocationSearchResult[] }
  | { readonly status: 'empty'; readonly query: string }
  | { readonly status: 'error'; readonly errorKind: AppErrorKind };

export type MapSelection =
  | { readonly type: 'place'; readonly place: Place }
  | { readonly type: 'pin'; readonly marker: CustomMarker; readonly label: string };

export type MapCanvasState =
  /** MapView can't be mounted here (Android without a Google Maps key). */
  | { readonly status: 'unavailable' }
  | { readonly status: 'failed'; readonly retry: () => void }
  | { readonly status: 'showing'; readonly mountKey: number; readonly onReady: () => void };

export interface ExploreMapState {
  readonly location: MapLocationState;
  /** Where places are loaded around: the picked search result, else the device. */
  readonly center: Coordinates | null;
  /** Changes whenever the camera should move back to `center` (My location, picking a result), even if `center` is unchanged. */
  readonly recenterRequest: number;
  readonly searchTarget: LocationSearchResult | null;
  readonly showsUserLocation: boolean;
  readonly returnToDevice: (() => void) | null;

  readonly query: string;
  readonly setQuery: (query: string) => void;
  readonly submitSearch: () => void;
  readonly search: SearchState;
  readonly resultsOpen: boolean;
  readonly closeResults: () => void;
  readonly pickResult: (result: LocationSearchResult) => void;

  readonly categories: readonly PlaceCategory[];
  readonly toggleCategory: (category: PlaceCategory) => void;
  readonly places: readonly Place[];
  readonly placesState: PlacesState;

  readonly customMarkers: readonly CustomMarker[];
  readonly addPin: (coordinates: Coordinates) => void;
  readonly notice: MapNotice | null;
  readonly dismissNotice: () => void;

  readonly selection: MapSelection | null;
  readonly selectPlace: (place: Place) => void;
  readonly selectPin: (marker: CustomMarker) => void;
  readonly clearSelection: () => void;
  readonly removeSelectedPin: () => void;
  readonly openDirections: () => void;
  readonly directionsFailed: boolean;
  /** Resolves `false` when no browser could open the link. */
  readonly openWebsite: (url: string) => Promise<boolean>;

  readonly map: MapCanvasState;
}

function useMapCanvas(): MapCanvasState {
  const available = useMemo(
    () =>
      isMapAvailable({
        os: Platform.OS,
        googleMapsApiKey: Constants.expoConfig?.android?.config?.googleMaps?.apiKey,
        executionEnvironment: Constants.executionEnvironment,
      }),
    [],
  );
  const [mountKey, setMountKey] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // The map can't draw while the app is in the background, so the ready timeout only counts in the foreground.
  const [inForeground, setInForeground] = useState(() => AppState.currentState !== 'background');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setInForeground(state !== 'background'));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!available || ready || failed || !inForeground) return undefined;
    const timer = setTimeout(() => setFailed(true), MAP_READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [available, ready, failed, inForeground, mountKey]);

  const onReady = useCallback(() => setReady(true), []);
  const retry = useCallback(() => {
    setReady(false);
    setFailed(false);
    setMountKey((key) => key + 1);
  }, []);

  if (!available) return { status: 'unavailable' };
  if (failed) return { status: 'failed', retry };
  return { status: 'showing', mountKey, onReady };
}

/**
 * View model for the explore map: device position, search, category filters,
 * places, pins, the details sheet and directions. Location and API logic stay
 * in the use cases; this hook only wires them to screen state.
 */
export function useExploreMap(): ExploreMapState {
  const { logger } = useDependencies();
  const dispatch = useAppDispatch();
  const location = useMapLocation();
  const device = location.status === 'located' ? location.location : null;

  // Search: nothing is sent while typing; Nominatim forbids autocomplete.
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [tooShort, setTooShort] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [searchTarget, setSearchTarget] = useState<LocationSearchResult | null>(null);
  const [recenterRequest, setRecenterRequest] = useState(0);
  const { i18n } = useTranslation();
  const searchQuery = useSearchLocationsQuery(
    submitted === null ? skipToken : { query: submitted, language: i18n.language },
  );
  const { refetch: refetchSearch, isError: searchFailed } = searchQuery;

  const submitSearch = useCallback(() => {
    const trimmed = query.trim();
    setResultsOpen(true);
    if (trimmed.length < SEARCH_QUERY_MIN) {
      setTooShort(true);
      setSubmitted(null);
      return;
    }
    setTooShort(false);
    // Submitting the same query again after a failure asks again; a success stays cached.
    if (trimmed === submitted && searchFailed) void refetchSearch();
    else setSubmitted(trimmed);
  }, [query, submitted, searchFailed, refetchSearch]);

  const closeResults = useCallback(() => setResultsOpen(false), []);

  const pickResult = useCallback((result: LocationSearchResult) => {
    setSearchTarget(result);
    setResultsOpen(false);
    setRecenterRequest((count) => count + 1);
  }, []);

  const search = useMemo((): SearchState => {
    if (tooShort) return { status: 'tooShort' };
    if (submitted === null) return { status: 'idle' };
    if (searchQuery.isFetching) return { status: 'loading' };
    const errorKind = mapErrorKind(searchQuery.error);
    if (errorKind) return { status: 'error', errorKind };
    const results = searchQuery.currentData;
    if (!results) return { status: 'loading' };
    return results.length > 0 ? { status: 'results', results } : { status: 'empty', query: submitted };
  }, [tooShort, submitted, searchQuery.isFetching, searchQuery.error, searchQuery.currentData]);

  // Places: one request per centre; categories filter on the device.
  const center = searchTarget?.coordinates ?? device;
  const nearby = useNearbyPlacesQuery(center ?? skipToken);
  const [categories, setCategories] = useState<readonly PlaceCategory[]>(PLACE_CATEGORIES);
  const toggleCategory = useCallback((category: PlaceCategory) => {
    setCategories((current) =>
      current.includes(category)
        ? current.filter((selected) => selected !== category)
        : PLACE_CATEGORIES.filter((candidate) => candidate === category || current.includes(candidate)),
    );
  }, []);

  // `data` keeps the last places that loaded, so a failed reload leaves them on the map.
  const loadedPlaces = nearby.data;
  const places = useMemo(() => filterPlaces(loadedPlaces ?? [], categories), [loadedPlaces, categories]);

  const { refetch: refetchPlaces } = nearby;
  const placesErrorKind = nearby.isFetching ? null : mapErrorKind(nearby.error);
  const placesState = useMemo((): PlacesState => {
    if (!center) return { status: 'idle' };
    if (placesErrorKind && placesErrorKind !== 'cancelled') {
      return { status: 'error', errorKind: placesErrorKind, retry: () => void refetchPlaces() };
    }
    if (nearby.isFetching || !nearby.currentData) return { status: 'loading' };
    if (nearby.currentData.length === 0) return { status: 'empty' };
    if (categories.length === 0) return { status: 'noCategories' };
    return { status: 'ready' };
  }, [center, placesErrorKind, refetchPlaces, nearby.isFetching, nearby.currentData, categories.length]);

  // Back online after a failed load: try again without waiting for a tap.
  const { isOffline } = useConnectivity();
  const wasOffline = useRef(isOffline);
  useEffect(() => {
    const cameOnline = wasOffline.current && !isOffline;
    wasOffline.current = isOffline;
    if (cameOnline && placesErrorKind) void refetchPlaces();
  }, [isOffline, placesErrorKind, refetchPlaces]);

  // Pins.
  const customMarkers = useAppSelector(selectCustomMarkers);
  const notice = useAppSelector(selectMapNotice);
  useEffect(() => {
    void dispatch(loadCustomMarkers());
  }, [dispatch]);
  const addPin = useCallback((coordinates: Coordinates) => void dispatch(addCustomMarker(coordinates)), [dispatch]);
  const dismissNotice = useCallback(() => dispatch(dismissMapNotice()), [dispatch]);

  // Selection, details sheet and directions.
  const [selection, setSelection] = useState<MapSelection | null>(null);
  const [directionsFailed, setDirectionsFailed] = useState(false);
  const select = useCallback((next: MapSelection | null) => {
    setSelection(next);
    setDirectionsFailed(false);
  }, []);
  const selectPlace = useCallback((place: Place) => select({ type: 'place', place }), [select]);
  const selectPin = useCallback(
    (marker: CustomMarker) => select({ type: 'pin', marker, label: formatPinLabel(marker.coordinates) }),
    [select],
  );
  const clearSelection = useCallback(() => select(null), [select]);

  const removeSelectedPin = useCallback(() => {
    if (selection?.type !== 'pin') return;
    void dispatch(removeCustomMarker(selection.marker.id));
    select(null);
  }, [dispatch, selection, select]);

  // A second tap while the maps app is opening would open it twice; ignore it.
  const directionsInFlight = useRef(false);
  const openDirections = useCallback(() => {
    if (!selection || directionsInFlight.current) return;
    directionsInFlight.current = true;
    const [destination, name] =
      selection.type === 'place'
        ? [selection.place.coordinates, selection.place.name]
        : [selection.marker.coordinates, selection.label];
    void (async () => {
      try {
        for (const url of buildDirectionsUrls(destination, name, Platform.OS)) {
          if (await openExternalUrl(url, logger)) {
            select(null);
            return;
          }
        }
        setDirectionsFailed(true);
      } finally {
        directionsInFlight.current = false;
      }
    })();
  }, [selection, logger, select]);

  const openWebsite = useCallback((url: string) => openExternalUrl(url, logger), [logger]);

  // Also recentres when no search is active: the user may have panned away from the device.
  // An old position is read again; the camera then follows the new one when it arrives.
  const refreshDevice = location.status === 'located' ? location.refreshIfStale : null;
  const returnToDevice = useCallback(() => {
    setSearchTarget(null);
    setRecenterRequest((count) => count + 1);
    refreshDevice?.();
  }, [refreshDevice]);
  const map = useMapCanvas();

  return {
    location,
    center,
    recenterRequest,
    searchTarget,
    showsUserLocation: location.status === 'located' || location.status === 'locating',
    returnToDevice: device ? returnToDevice : null,
    query,
    setQuery,
    submitSearch,
    search,
    resultsOpen,
    closeResults,
    pickResult,
    categories,
    toggleCategory,
    places,
    placesState,
    customMarkers,
    addPin,
    notice,
    dismissNotice,
    selection,
    selectPlace,
    selectPin,
    clearSelection,
    removeSelectedPin,
    openDirections,
    directionsFailed,
    openWebsite,
    map,
  };
}
