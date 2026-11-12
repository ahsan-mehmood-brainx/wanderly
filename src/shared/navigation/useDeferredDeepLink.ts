import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { deepLinkInbox, resolveDeepLink, type DeepLinkInbox } from './deepLinks';

/**
 * Replays a link that arrived before the app could open it (during session
 * restore, or while signed out) as soon as `canNavigate` becomes true.
 *
 * The replay waits one macrotask: the guard change that set `canNavigate` also
 * makes the router redirect to the phase's entry screen, and navigating in the
 * same commit would be overwritten by that redirect.
 *
 * While `canNavigate` is true the router opens incoming links itself, so new
 * arrivals are discarded rather than replayed again after the next sign-in.
 */
export function useDeferredDeepLink(canNavigate: boolean, inbox: DeepLinkInbox = deepLinkInbox): void {
  const router = useRouter();

  useEffect(() => {
    if (!canNavigate) return;

    const pending = inbox.take();
    const href = pending ? resolveDeepLink(pending) : null;
    const timer = href ? setTimeout(() => router.navigate(href), 0) : undefined;
    const unsubscribe = inbox.subscribe(() => inbox.clear());

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [canNavigate, inbox, router]);
}
