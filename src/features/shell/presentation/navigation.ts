import { type Href } from 'expo-router';

import { routes } from '@/shared/navigation/routes';
import { type AppIconName } from '@/shared/ui';

export type MainDestination = 'home' | 'explore' | 'trips' | 'savedPlaces' | 'profile';

export interface MainDestinationItem {
  readonly id: MainDestination;
  readonly icon: AppIconName;
  readonly href: Href;
}

/** Drawer entries, in order. Copy lives in `navigation.<id>`. */
export const DRAWER_DESTINATIONS: readonly MainDestinationItem[] = [
  { id: 'home', icon: 'home', href: routes.home },
  { id: 'explore', icon: 'explore', href: routes.explore },
  { id: 'trips', icon: 'luggage', href: routes.trips },
  { id: 'savedPlaces', icon: 'bookmark', href: routes.savedPlaces },
  { id: 'profile', icon: 'person', href: routes.profile },
];

/** Highlights the drawer entry that owns the current screen, including its nested screens. */
export function activeDestination(pathname: string): MainDestination | null {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/explore') || pathname.startsWith('/destinations')) return 'explore';
  if (pathname.startsWith('/trips')) return 'trips';
  if (pathname.startsWith('/saved')) return 'savedPlaces';
  if (pathname.startsWith('/profile')) return 'profile';
  return null;
}

/**
 * Screens where swiping from the edge opens the drawer. Elsewhere the same gesture
 * is the platform's "back" swipe, and the drawer must not steal it.
 */
const DRAWER_SWIPE_PATHS: ReadonlySet<string> = new Set(['/', '/explore', '/trips', '/budget', '/profile', '/saved']);

export function isDrawerSwipeEnabled(pathname: string): boolean {
  return DRAWER_SWIPE_PATHS.has(pathname);
}
