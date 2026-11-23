import * as Notifications from 'expo-notifications';

import { type Logger } from '@/core/logging/Logger';

import { type NotificationResponses } from '../domain/repositories';

/** Notification taps from expo-notifications, including the one that launched the app. */
export class ExpoNotificationResponses implements NotificationResponses {
  constructor(private readonly logger: Logger) {}

  subscribe(listener: (data: unknown) => void): () => void {
    const deliver = (response: Notifications.NotificationResponse) => {
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      listener(response.notification.request.content.data);
    };

    let subscription: { remove(): void } | null = null;
    try {
      subscription = Notifications.addNotificationResponseReceivedListener(deliver);
      // The tap that cold-started the app happened before anyone listened.
      const launch = Notifications.getLastNotificationResponse();
      if (launch) {
        Notifications.clearLastNotificationResponse();
        deliver(launch);
      }
    } catch (cause) {
      this.logger.warn('Could not listen for notification taps', { cause });
    }

    return () => subscription?.remove();
  }
}
