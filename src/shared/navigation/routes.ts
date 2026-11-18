import { type Href } from 'expo-router';

/**
 * Typed parameters for each dynamic route. Route files read them with
 * `useLocalSearchParams<TripRouteParams>()` and validate them with {@link parseRouteId}
 * before use, because deep links make every parameter user input.
 */
export interface DestinationRouteParams extends Record<string, string> {
  readonly destinationId: string;
}

export interface TripRouteParams extends Record<string, string> {
  readonly tripId: string;
}

export interface ItineraryItemRouteParams extends Record<string, string> {
  readonly tripId: string;
  readonly itemId: string;
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
  budget: '/budget',
  profile: '/profile',
  settings: '/profile/settings',
  designSystem: '/profile/design-system',
  savedPlaces: '/saved',
  signIn: '/sign-in',
  register: '/register',
  destination: (destinationId: string) =>
    ({ pathname: '/destinations/[destinationId]', params: { destinationId } }) satisfies Href,
  trip: (tripId: string) => ({ pathname: '/trips/[tripId]', params: { tripId } }) satisfies Href,
  itineraryItem: (tripId: string, itemId: string) =>
    ({ pathname: '/trips/[tripId]/itinerary/[itemId]', params: { tripId, itemId } }) satisfies Href,
} as const satisfies Record<string, Href | ((...ids: string[]) => Href)>;

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
