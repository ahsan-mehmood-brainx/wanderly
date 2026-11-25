export const NOTIFICATION_KINDS = ['tripUpcoming', 'tripStart', 'activity', 'budget'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * - `granted`: notifications can be shown (iOS provisional counts).
 * - `undetermined`: never asked; the system prompt can be shown.
 * - `denied`: declined, but the prompt can still be shown again.
 * - `blocked`: declined for good; only the system settings can change it.
 */
export type NotificationPermission = 'granted' | 'undetermined' | 'denied' | 'blocked';

/** Every identifier Wanderly schedules starts with this, so its own notifications can be told apart. */
export const NOTIFICATION_ID_PREFIX = 'wanderly.';

export function isWanderlyNotification(identifier: string): boolean {
  return identifier.startsWith(NOTIFICATION_ID_PREFIX);
}

/** Deep links a notification opens; every one is on the `resolveDeepLink` allow-list. */
export const notificationLinks = {
  trip: (tripId: string) => `wanderly://trips/${encodeURIComponent(tripId)}`,
  activity: (tripId: string, activityId: string) =>
    `wanderly://trips/${encodeURIComponent(tripId)}/itinerary/${encodeURIComponent(activityId)}`,
  budget: (tripId: string) => `wanderly://budget/${encodeURIComponent(tripId)}`,
} as const;

/** Reads what a scheduled or tapped notification carries; `null` when it isn't Wanderly's shape. */
export function parseNotificationData(data: unknown): NotificationData | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const { url, ownerId, kind, fingerprint } = data as Record<string, unknown>;
  if (typeof url !== 'string' || typeof ownerId !== 'string') return null;
  if (typeof kind !== 'string' || !(NOTIFICATION_KINDS as readonly string[]).includes(kind)) return null;
  return {
    url,
    ownerId,
    kind: kind as NotificationKind,
    fingerprint: typeof fingerprint === 'string' ? fingerprint : '',
  };
}

/** What a scheduled or shown notification carries, read back when it is listed or tapped. */
export interface NotificationData {
  /** A deep link resolved through the `resolveDeepLink` allow-list. */
  readonly url: string;
  readonly ownerId: string;
  readonly kind: NotificationKind;
  /** Changes whenever anything shown or the fire time changes, so a changed reminder is rescheduled. */
  readonly fingerprint: string;
}

/** A reminder that should be scheduled with the OS. */
export interface PlannedNotification {
  /** Stable per entity: `wanderly.trip-upcoming.<tripId>`, `wanderly.trip-start.<tripId>`, `wanderly.activity.<activityId>`. */
  readonly identifier: string;
  readonly kind: Exclude<NotificationKind, 'budget'>;
  readonly ownerId: string;
  /** Epoch ms. */
  readonly fireAt: number;
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly fingerprint: string;
}

/** A notification shown right away (budget alerts). */
export interface ImmediateNotification {
  readonly identifier: string;
  readonly kind: 'budget';
  readonly ownerId: string;
  readonly title: string;
  readonly body: string;
  readonly url: string;
}

/** A notification the OS has scheduled; `data` is whatever was attached (untrusted). */
export interface ScheduledNotification {
  readonly identifier: string;
  readonly data: unknown;
}
