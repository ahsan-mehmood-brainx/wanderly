import { type Href } from 'expo-router';

import { Subject, type Unsubscribe } from '@/core/events/Subject';

import { parseRouteId, routes } from './routes';

/**
 * Normalises whatever the OS hands over into an app path (`/trips/abc`):
 * `wanderly://trips/abc`, `exp://192.168.1.2:8081/--/trips/abc` (Expo Go / dev client),
 * `https://example.com/trips/abc` (universal links) or an already-relative path.
 * Query strings and fragments are dropped; no deep-link target uses them.
 */
export function toAppPath(rawUrl: string): string {
  const raw = rawUrl.trim();
  const schemeMatch = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(raw);

  let path: string;
  if (!schemeMatch) {
    path = raw;
  } else {
    const scheme = (schemeMatch[1] ?? '').toLowerCase();
    const rest = schemeMatch[2] ?? '';
    const devSeparator = rest.indexOf('/--/');
    if (devSeparator !== -1) {
      path = rest.slice(devSeparator + 3);
    } else if (scheme === 'http' || scheme === 'https' || scheme === 'exp' || scheme === 'exps') {
      const slash = rest.indexOf('/');
      path = slash === -1 ? '/' : rest.slice(slash);
    } else {
      // Custom scheme: the "host" is the first path segment (wanderly://trips/abc).
      path = rest;
    }
  }

  const withoutQuery = path.split(/[?#]/, 1)[0] ?? '';
  const collapsed = `/${withoutQuery}`.replace(/\/{2,}/g, '/');
  return collapsed.length > 1 ? collapsed.replace(/\/$/, '') : '/';
}

const TOP_LEVEL: Readonly<Record<string, Href>> = {
  '/explore': routes.explore,
  '/trips': routes.trips,
  '/budget': routes.budget,
  '/profile': routes.profile,
  '/saved': routes.savedPlaces,
};

/**
 * Maps an incoming link to a protected in-app destination worth restoring after
 * launch or sign-in. Deliberately an allow-list: only content screens are
 * replayed, never auth or onboarding routes, and ids must pass {@link parseRouteId}.
 */
export function resolveDeepLink(rawUrl: string): Href | null {
  const path = toAppPath(rawUrl);
  const topLevel = TOP_LEVEL[path];
  if (topLevel) return topLevel;

  const segments = path.split('/').filter(Boolean).map(safeDecode);

  if (segments.length === 2 && segments[0] === 'destinations') {
    const destinationId = parseRouteId(segments[1]);
    return destinationId ? routes.destination(destinationId) : null;
  }
  if (segments[0] === 'trips' && segments.length === 2) {
    const tripId = parseRouteId(segments[1]);
    return tripId ? routes.trip(tripId) : null;
  }
  if (segments[0] === 'trips' && segments.length === 4 && segments[2] === 'itinerary') {
    const tripId = parseRouteId(segments[1]);
    const itemId = parseRouteId(segments[3]);
    return tripId && itemId ? routes.itineraryItem(tripId, itemId) : null;
  }
  return null;
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Holds the most recent incoming link until the app can honour it.
 *
 * Content routes sit behind `Stack.Protected` guards, so a link that arrives while
 * the session is still being restored, or while signed out, is redirected away
 * from by the router and would otherwise be lost. The router hands every
 * incoming path to `+native-intent` before navigating; that hook records it here,
 * and the root navigator replays it once the user is signed in.
 */
export class DeepLinkInbox {
  private pending: string | null = null;
  private readonly arrivals = new Subject<void>();

  record(rawUrl: string): void {
    this.pending = rawUrl;
    this.arrivals.emit();
  }

  /** Returns and forgets the pending link. */
  take(): string | null {
    const pending = this.pending;
    this.pending = null;
    return pending;
  }

  clear(): void {
    this.pending = null;
  }

  subscribe(listener: () => void): Unsubscribe {
    return this.arrivals.subscribe(listener);
  }
}

/**
 * The app's inbox. A module-level instance because `+native-intent` is called by
 * the router outside the React tree and the DI container; it is the only bridge
 * between the two and holds nothing but a path string.
 */
export const deepLinkInbox = new DeepLinkInbox();
