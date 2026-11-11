import { redirectSystemPath } from '@/app/+native-intent';
import { resolveAppPhase } from '@/bootstrap/appPhase';
import { activeDestination, isDrawerSwipeEnabled } from '@/features/shell/presentation/navigation';

import { DeepLinkInbox, deepLinkInbox, resolveDeepLink, toAppPath } from './deepLinks';
import { parseRouteId, routes } from './routes';

describe('toAppPath', () => {
  it.each([
    ['wanderly://trips/abc', '/trips/abc'],
    ['wanderly:///trips/abc', '/trips/abc'],
    ['exp://192.168.1.2:8081/--/trips/abc', '/trips/abc'],
    ['https://wanderly.app/destinations/kyoto?utm=1#top', '/destinations/kyoto'],
    ['/trips/abc/', '/trips/abc'],
    ['trips/abc', '/trips/abc'],
    ['wanderly://', '/'],
  ])('%s → %s', (url, path) => {
    expect(toAppPath(url)).toBe(path);
  });
});

describe('resolveDeepLink', () => {
  it('opens a destination, a trip and an itinerary item', () => {
    expect(resolveDeepLink('wanderly://destinations/kyoto')).toEqual(routes.destination('kyoto'));
    expect(resolveDeepLink('wanderly://trips/t-42')).toEqual(routes.trip('t-42'));
    expect(resolveDeepLink('wanderly://trips/t-42/itinerary/day2_lunch')).toEqual(
      routes.itineraryItem('t-42', 'day2_lunch'),
    );
  });

  it('opens top-level destinations', () => {
    expect(resolveDeepLink('/saved')).toBe(routes.savedPlaces);
  });

  it('never replays auth or unknown routes, or ids that fail validation', () => {
    expect(resolveDeepLink('/sign-in')).toBeNull();
    expect(resolveDeepLink('/onboarding')).toBeNull();
    expect(resolveDeepLink('/')).toBeNull();
    expect(resolveDeepLink('/trips/a%20b')).toBeNull();
    expect(resolveDeepLink('/trips/abc/itinerary')).toBeNull();
    expect(resolveDeepLink(`/destinations/${'x'.repeat(65)}`)).toBeNull();
  });
});

describe('parseRouteId', () => {
  it('accepts a single short URL-safe id', () => {
    expect(parseRouteId('trip_1-a')).toBe('trip_1-a');
    expect(parseRouteId(undefined)).toBeNull();
    expect(parseRouteId(['a', 'b'])).toBeNull();
    expect(parseRouteId('../etc')).toBeNull();
  });
});

describe('DeepLinkInbox', () => {
  it('keeps only the latest link, and hands it out once', () => {
    const inbox = new DeepLinkInbox();
    const listener = jest.fn();
    inbox.subscribe(listener);

    inbox.record('/trips/1');
    inbox.record('/trips/2');

    expect(listener).toHaveBeenCalledTimes(2);
    expect(inbox.take()).toBe('/trips/2');
    expect(inbox.take()).toBeNull();
  });

  it('is fed by +native-intent, which never rewrites the path', () => {
    deepLinkInbox.clear();
    expect(redirectSystemPath({ path: 'wanderly://trips/9', initial: true })).toBe('wanderly://trips/9');
    expect(deepLinkInbox.take()).toBe('wanderly://trips/9');
  });
});

describe('resolveAppPhase', () => {
  const ready = (completed: boolean) => ({ status: 'ready' as const, completed });

  it('shows the launch screen until both the session and onboarding are known', () => {
    expect(resolveAppPhase({ authStatus: 'restoring', onboarding: ready(true) })).toBe('splash');
    expect(resolveAppPhase({ authStatus: 'authenticated', onboarding: { status: 'loading', completed: false } })).toBe(
      'splash',
    );
  });

  it('routes first runs through onboarding, then sign-in', () => {
    expect(resolveAppPhase({ authStatus: 'unauthenticated', onboarding: ready(false) })).toBe('onboarding');
    expect(resolveAppPhase({ authStatus: 'unauthenticated', onboarding: ready(true) })).toBe('auth');
  });

  it('lets a restored session skip onboarding', () => {
    expect(resolveAppPhase({ authStatus: 'authenticated', onboarding: ready(false) })).toBe('app');
  });
});

describe('drawer navigation helpers', () => {
  it('highlights the owning destination for nested screens', () => {
    expect(activeDestination('/')).toBe('home');
    expect(activeDestination('/destinations/kyoto')).toBe('explore');
    expect(activeDestination('/trips/1/itinerary/2')).toBe('trips');
    expect(activeDestination('/profile/settings')).toBe('profile');
    expect(activeDestination('/budget')).toBeNull();
  });

  it('only lets the edge swipe open the drawer on root screens', () => {
    expect(isDrawerSwipeEnabled('/trips')).toBe(true);
    expect(isDrawerSwipeEnabled('/trips/1')).toBe(false);
  });
});
