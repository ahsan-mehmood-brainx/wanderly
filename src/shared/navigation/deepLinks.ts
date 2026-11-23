import { type Href } from 'expo-router';

import { Subject, type Unsubscribe } from '@/core/events/Subject';
import { isLocalDate } from '@/features/trips/domain/localDate';

import { parseDestinationRouteId, parseRouteId, routes } from './routes';

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
  '/search': routes.search(),
  '/trips': routes.trips,
  // Listed before the `/trips/<id>` pattern: these words are screens, not trip ids.
  '/trips/new': routes.newTrip,
  '/trips/upcoming': routes.upcomingTrips,
  '/trips/completed': routes.completedTrips,
  '/budget': routes.budget,
  '/profile': routes.profile,
  '/saved': routes.savedPlaces,
  '/map': routes.map,
};

/**
 * Maps an incoming link to a protected in-app destination worth restoring after
 * launch or sign-in. Deliberately an allow-list: only content screens are
 * replayed, never auth or onboarding routes, and ids must pass {@link parseRouteId}
 * (or {@link parseDestinationRouteId}).
 */
export function resolveDeepLink(rawUrl: string): Href | null {
  const path = toAppPath(rawUrl);
  const topLevel = TOP_LEVEL[path];
  if (topLevel) return topLevel;

  const segments = path.split('/').filter(Boolean).map(safeDecode);

  if (segments.length === 2 && segments[0] === 'destinations') {
    const destinationId = parseDestinationRouteId(segments[1]);
    return destinationId ? routes.destination(destinationId) : null;
  }
  if (segments.length === 3 && segments[0] === 'destinations' && segments[2] === 'weather') {
    const destinationId = parseDestinationRouteId(segments[1]);
    return destinationId ? routes.destinationWeather(destinationId) : null;
  }
  if (segments[0] === 'trips' && segments.length === 2) {
    const tripId = parseRouteId(segments[1]);
    return tripId ? routes.trip(tripId) : null;
  }
  if (segments[0] === 'trips' && segments.length === 3 && segments[2] === 'edit') {
    const tripId = parseRouteId(segments[1]);
    return tripId ? routes.editTrip(tripId) : null;
  }
  if (segments[0] === 'trips' && segments.length === 3 && segments[2] === 'weather') {
    const tripId = parseRouteId(segments[1]);
    return tripId ? routes.tripWeather(tripId) : null;
  }
  if (segments[0] === 'trips' && segments[2] === 'itinerary') return resolveItineraryLink(segments);
  if (segments[0] === 'budget') return resolveBudgetLink(segments);
  return null;
}

/** Budget screen names that sit beside `[expenseId]`; generated expense ids never take these values. */
const BUDGET_SCREEN_WORDS: ReadonlySet<string> = new Set(['new']);

/** `/budget/:tripId/…`: the trip's overview, history, breakdown and expense screens. */
function resolveBudgetLink(segments: readonly string[]): Href | null {
  const tripId = parseRouteId(segments[1]);
  if (!tripId) return null;
  if (segments.length === 2) return routes.tripBudget(tripId);
  if (segments.length === 3 && segments[2] === 'breakdown') return routes.spendingBreakdown(tripId);
  if (segments[2] !== 'expenses') return null;
  if (segments.length === 3) return routes.expenseHistory(tripId);
  // Checked before the expense pattern: `new` is the add-expense form, not an expense id.
  if (segments.length === 4 && segments[3] === 'new') return routes.newExpense(tripId);
  const expenseId = parseExpenseId(segments[3]);
  if (!expenseId) return null;
  if (segments.length === 4) return routes.expense(tripId, expenseId);
  if (segments.length === 5 && segments[4] === 'edit') return routes.editExpense(tripId, expenseId);
  return null;
}

function parseExpenseId(segment: string | undefined): string | null {
  const expenseId = parseRouteId(segment);
  return expenseId && !BUDGET_SCREEN_WORDS.has(expenseId) ? expenseId : null;
}

/** Itinerary screen names that sit beside `[itemId]`; generated activity ids never take these values. */
const ITINERARY_SCREEN_WORDS: ReadonlySet<string> = new Set(['new', 'day']);

/** `/trips/:tripId/itinerary/…`. The bare itinerary path isn't replayed; only its screens below are. */
function resolveItineraryLink(segments: readonly string[]): Href | null {
  const tripId = parseRouteId(segments[1]);
  if (!tripId) return null;
  // Checked before the item pattern: `new` is the add-activity form, not an activity id.
  if (segments.length === 4 && segments[3] === 'new') return routes.newActivity(tripId);
  if (segments.length === 4) {
    const itemId = parseItineraryItemId(segments[3]);
    return itemId ? routes.itineraryItem(tripId, itemId) : null;
  }
  if (segments.length === 5 && segments[3] === 'day') {
    const date = segments[4];
    return isLocalDate(date) ? routes.itineraryDay(tripId, date) : null;
  }
  if (segments.length === 5 && segments[4] === 'edit') {
    const itemId = parseItineraryItemId(segments[3]);
    return itemId ? routes.editActivity(tripId, itemId) : null;
  }
  return null;
}

function parseItineraryItemId(segment: string | undefined): string | null {
  const itemId = parseRouteId(segment);
  return itemId && !ITINERARY_SCREEN_WORDS.has(itemId) ? itemId : null;
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
