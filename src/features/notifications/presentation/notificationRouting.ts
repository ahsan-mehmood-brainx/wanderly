import { type Href } from 'expo-router';

import { resolveDeepLink } from '@/shared/navigation/deepLinks';

import { parseNotificationData } from '../domain/Notification';

/**
 * Where a tapped notification leads: its link through the deep-link allow-list,
 * or `null` when the data is malformed, the link isn't allowed, or it belongs to
 * another account.
 */
export function routeForNotification(data: unknown, currentOwnerId: string | null): Href | null {
  const parsed = parseNotificationData(data);
  if (!parsed || currentOwnerId === null || parsed.ownerId !== currentOwnerId) return null;
  return resolveDeepLink(parsed.url);
}
