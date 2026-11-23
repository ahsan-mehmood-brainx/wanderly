import { type Href } from 'expo-router';

/**
 * Typed parameters for each dynamic route. Route files read them with
 * `useLocalSearchParams<TripRouteParams>()` and validate them with {@link parseRouteId}
 * before use, because deep links make every parameter user input.
 */
export interface DestinationRouteParams extends Record<string, string> {
  readonly destinationId: string;
}

export interface SearchRouteParams extends Record<string, string | undefined> {
  /** Pre-filled query. */
  readonly q?: string;
  /** Pre-selected destination category (validated by the screen). */
  readonly category?: string;
}

export interface TripRouteParams extends Record<string, string> {
  readonly tripId: string;
}

export interface ItineraryItemRouteParams extends Record<string, string> {
  readonly tripId: string;
  readonly itemId: string;
}

export interface ItineraryDayRouteParams extends Record<string, string> {
  readonly tripId: string;
  /** `YYYY-MM-DD`, validated with `isLocalDate`. */
  readonly date: string;
}

export interface NewActivityRouteParams extends Record<string, string | undefined> {
  readonly tripId: string;
  /** Day to preselect (`YYYY-MM-DD`). */
  readonly date?: string;
}

export interface ExpenseRouteParams extends Record<string, string> {
  readonly tripId: string;
  readonly expenseId: string;
}

export interface PhotoFlowRouteParams extends Record<string, string | undefined> {
  readonly tripId: string;
  /** Set when the photos are for one of the trip's activities. */
  readonly activityId?: string;
}

export interface PhotoRouteParams extends Record<string, string | undefined> {
  readonly tripId: string;
  readonly photoId: string;
  /** Set when opened from an activity's gallery. */
  readonly activityId?: string;
}

export interface CollectionRouteParams extends Record<string, string> {
  readonly collectionId: string;
}

export interface SignInRouteParams extends Record<string, string | undefined> {
  /** `demo` pre-fills the demo account (used after the demo sign-up). */
  readonly prefill?: 'demo';
}

/**
 * Every place the app navigates to, built from the typed-routes manifest so a
 * renamed or removed route is a compile error at each call site.
 * Group segments are omitted: `/trips` is the Trips tab inside the drawer.
 */
export const routes = {
  home: '/',
  explore: '/explore',
  trips: '/trips',
  newTrip: '/trips/new',
  upcomingTrips: '/trips/upcoming',
  completedTrips: '/trips/completed',
  budget: '/budget',
  profile: '/profile',
  editProfile: '/profile/edit',
  settings: '/profile/settings',
  privacy: '/profile/privacy',
  about: '/profile/about',
  designSystem: '/profile/design-system',
  offlineData: '/profile/offline',
  notificationSettings: '/profile/notifications',
  savedPlaces: '/saved',
  collection: (collectionId: string) =>
    ({ pathname: '/saved/collections/[collectionId]', params: { collectionId } }) satisfies Href,
  map: '/map',
  signIn: '/sign-in',
  register: '/register',
  search: (params: SearchRouteParams = {}) => ({ pathname: '/search', params }) satisfies Href,
  destination: (destinationId: string) =>
    ({ pathname: '/destinations/[destinationId]', params: { destinationId } }) satisfies Href,
  destinationWeather: (destinationId: string) =>
    ({ pathname: '/destinations/[destinationId]/weather', params: { destinationId } }) satisfies Href,
  trip: (tripId: string) => ({ pathname: '/trips/[tripId]', params: { tripId } }) satisfies Href,
  editTrip: (tripId: string) => ({ pathname: '/trips/[tripId]/edit', params: { tripId } }) satisfies Href,
  tripWeather: (tripId: string) => ({ pathname: '/trips/[tripId]/weather', params: { tripId } }) satisfies Href,
  itinerary: (tripId: string) => ({ pathname: '/trips/[tripId]/itinerary', params: { tripId } }) satisfies Href,
  itineraryDay: (tripId: string, date: string) =>
    ({ pathname: '/trips/[tripId]/itinerary/day/[date]', params: { tripId, date } }) satisfies Href,
  newActivity: (tripId: string, date?: string) =>
    ({
      pathname: '/trips/[tripId]/itinerary/new',
      params: date === undefined ? { tripId } : { tripId, date },
    }) satisfies Href,
  itineraryItem: (tripId: string, itemId: string) =>
    ({ pathname: '/trips/[tripId]/itinerary/[itemId]', params: { tripId, itemId } }) satisfies Href,
  editActivity: (tripId: string, itemId: string) =>
    ({ pathname: '/trips/[tripId]/itinerary/[itemId]/edit', params: { tripId, itemId } }) satisfies Href,
  tripBudget: (tripId: string) => ({ pathname: '/budget/[tripId]', params: { tripId } }) satisfies Href,
  expenseHistory: (tripId: string) => ({ pathname: '/budget/[tripId]/expenses', params: { tripId } }) satisfies Href,
  newExpense: (tripId: string) => ({ pathname: '/budget/[tripId]/expenses/new', params: { tripId } }) satisfies Href,
  expense: (tripId: string, expenseId: string) =>
    ({ pathname: '/budget/[tripId]/expenses/[expenseId]', params: { tripId, expenseId } }) satisfies Href,
  editExpense: (tripId: string, expenseId: string) =>
    ({ pathname: '/budget/[tripId]/expenses/[expenseId]/edit', params: { tripId, expenseId } }) satisfies Href,
  spendingBreakdown: (tripId: string) =>
    ({ pathname: '/budget/[tripId]/breakdown', params: { tripId } }) satisfies Href,
  tripPhotos: (tripId: string) => ({ pathname: '/trips/[tripId]/photos', params: { tripId } }) satisfies Href,
  activityPhotos: (tripId: string, itemId: string) =>
    ({ pathname: '/trips/[tripId]/itinerary/[itemId]/photos', params: { tripId, itemId } }) satisfies Href,
  photoCamera: (tripId: string, activityId: string | null) =>
    ({
      pathname: '/trips/[tripId]/photos/camera',
      params: activityId === null ? { tripId } : { tripId, activityId },
    }) satisfies Href,
  photoPreview: (tripId: string, activityId: string | null) =>
    ({
      pathname: '/trips/[tripId]/photos/preview',
      params: activityId === null ? { tripId } : { tripId, activityId },
    }) satisfies Href,
  photo: (tripId: string, photoId: string, activityId: string | null) =>
    ({
      pathname: '/trips/[tripId]/photos/[photoId]',
      params: activityId === null ? { tripId, photoId } : { tripId, photoId, activityId },
    }) satisfies Href,
} as const satisfies Record<string, Href | ((...args: never[]) => Href)>;

const ROUTE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Validates an id from the URL. Returns `null` for anything that isn't a single,
 * short, URL-safe identifier (missing, repeated, or crafted values), so screens
 * can show an "invalid link" state instead of fetching garbage.
 */
export function parseRouteId(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return ROUTE_ID_PATTERN.test(trimmed) ? trimmed : null;
}

/** Destination ids can encode a Wikipedia title (`place-…`), so they may be longer than other ids; same safe charset. */
const DESTINATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,400}$/;

/**
 * Validates a destination id from the URL: shape only. The destination screen
 * parses it strictly (`parseDestinationId`) and shows "invalid link" if that fails.
 */
export function parseDestinationRouteId(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return DESTINATION_ID_PATTERN.test(trimmed) ? trimmed : null;
}
