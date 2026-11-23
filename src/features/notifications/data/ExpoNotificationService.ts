import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { Platform } from 'react-native';

import { AppError } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { err, ok, type Result } from '@/core/result';

import {
  type ImmediateNotification,
  isWanderlyNotification,
  type NotificationData,
  type NotificationPermission,
  type PlannedNotification,
  type ScheduledNotification,
} from '../domain/Notification';
import { type NotificationChannelNames, type NotificationService } from '../domain/repositories';

/** Android channel for trip and activity reminders. */
export const REMINDERS_CHANNEL_ID = 'reminders';
/** Android channel for budget alerts. */
export const BUDGET_CHANNEL_ID = 'budget';

/** Until reconcile or the permission prompt passes localized names. */
const DEFAULT_CHANNEL_NAMES: NotificationChannelNames = { reminders: 'Trip reminders', budget: 'Budget alerts' };

const sameChannelNames = (a: NotificationChannelNames, b: NotificationChannelNames): boolean =>
  a.reminders === b.reminders && a.budget === b.budget;

function toNotificationPermission(response: Notifications.NotificationPermissionsStatus): NotificationPermission {
  if (response.granted || response.status === 'granted') return 'granted';
  // iOS quiet (provisional) delivery still shows Wanderly's notifications in Notification Centre.
  const iosStatus = response.ios?.status;
  if (iosStatus === IosAuthorizationStatus.PROVISIONAL || iosStatus === IosAuthorizationStatus.EPHEMERAL) {
    return 'granted';
  }
  if (response.status === 'undetermined') return 'undetermined';
  // The system no longer shows the prompt: only the Settings app can turn notifications back on.
  return response.canAskAgain ? 'denied' : 'blocked';
}

function toData(notification: PlannedNotification | ImmediateNotification): NotificationData {
  return {
    url: notification.url,
    ownerId: notification.ownerId,
    kind: notification.kind,
    fingerprint: 'fingerprint' in notification ? notification.fingerprint : '',
  };
}

/** expo-notifications adapter: local notifications only, failures logged, never thrown. */
export class ExpoNotificationService implements NotificationService {
  private channels: Promise<void> | null = null;
  private channelNames: NotificationChannelNames = DEFAULT_CHANNEL_NAMES;

  constructor(private readonly logger: Logger) {
    // Without a handler, a notification that fires while Wanderly is open isn't shown at all.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  }

  getPermission(): Promise<NotificationPermission> {
    return this.readPermission('read', () => Notifications.getPermissionsAsync());
  }

  requestPermission(): Promise<NotificationPermission> {
    // When the prompt can't be shown any more the OS answers with the current permission.
    return this.readPermission('request', () =>
      Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } }),
    );
  }

  ensureChannels(names?: NotificationChannelNames): Promise<void> {
    if (Platform.OS !== 'android') return Promise.resolve();
    // Setting a channel again with the same id renames it (importance stays the user's choice).
    if (names && !sameChannelNames(names, this.channelNames)) {
      this.channelNames = names;
      this.channels = null;
    }
    this.channels ??= this.createChannels(this.channelNames);
    return this.channels;
  }

  async listScheduled(): Promise<Result<readonly ScheduledNotification[], AppError>> {
    try {
      const requests = await Notifications.getAllScheduledNotificationsAsync();
      return ok(requests.map(({ identifier, content }) => ({ identifier, data: content.data ?? null })));
    } catch (cause) {
      this.logger.warn('Could not list scheduled notifications', { cause });
      return err(new AppError('unknown', 'Could not list scheduled notifications', { cause }));
    }
  }

  async schedule(notification: PlannedNotification): Promise<Result<void, AppError>> {
    await this.ensureChannels();
    return this.send(notification, {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(notification.fireAt),
      channelId: REMINDERS_CHANNEL_ID,
    });
  }

  async present(notification: ImmediateNotification): Promise<Result<void, AppError>> {
    await this.ensureChannels();
    // A `null` trigger shows it now; on Android the channel picks how it is shown.
    return this.send(notification, Platform.OS === 'android' ? { channelId: BUDGET_CHANNEL_ID } : null);
  }

  async cancel(identifiers: readonly string[]): Promise<void> {
    for (const identifier of identifiers) {
      try {
        await Notifications.cancelScheduledNotificationAsync(identifier);
      } catch (cause) {
        this.logger.warn('Could not cancel a scheduled notification', { identifier, cause });
      }
    }
  }

  async dismissPresented(): Promise<void> {
    let presented: Notifications.Notification[];
    try {
      presented = await Notifications.getPresentedNotificationsAsync();
    } catch (cause) {
      this.logger.warn('Could not list delivered notifications', { cause });
      return;
    }
    for (const { request } of presented) {
      if (!isWanderlyNotification(request.identifier)) continue;
      try {
        await Notifications.dismissNotificationAsync(request.identifier);
      } catch (cause) {
        this.logger.warn('Could not dismiss a delivered notification', { identifier: request.identifier, cause });
      }
    }
  }

  private async send(
    notification: PlannedNotification | ImmediateNotification,
    trigger: Notifications.NotificationTriggerInput,
  ): Promise<Result<void, AppError>> {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: notification.identifier,
        content: {
          title: notification.title,
          body: notification.body,
          data: { ...toData(notification) },
        },
        trigger,
      });
      return ok(undefined);
    } catch (cause) {
      this.logger.warn('Could not schedule a notification', { identifier: notification.identifier, cause });
      return err(new AppError('unknown', 'Could not schedule a notification', { cause }));
    }
  }

  private async readPermission(
    action: string,
    call: () => Promise<Notifications.NotificationPermissionsStatus>,
  ): Promise<NotificationPermission> {
    try {
      return toNotificationPermission(await call());
    } catch (cause) {
      this.logger.warn(`Could not ${action} the notification permission`, { cause });
      return 'denied';
    }
  }

  private createChannels(names: NotificationChannelNames): Promise<void> {
    const creating = this.setChannels(names).then((created) => {
      // Try again next time rather than remembering the failure (unless a rename already replaced this run).
      if (!created && this.channels === creating) this.channels = null;
    });
    return creating;
  }

  /** True when both channels were set. */
  private async setChannels(names: NotificationChannelNames): Promise<boolean> {
    const results = await Promise.allSettled([
      Notifications.setNotificationChannelAsync(REMINDERS_CHANNEL_ID, {
        name: names.reminders,
        importance: AndroidImportance.HIGH,
      }),
      Notifications.setNotificationChannelAsync(BUDGET_CHANNEL_ID, {
        name: names.budget,
        importance: AndroidImportance.DEFAULT,
      }),
    ]);
    const failed = results.filter((result) => result.status === 'rejected');
    if (failed.length > 0) this.logger.warn('Could not create the notification channels', { failed: failed.length });
    return failed.length === 0;
  }
}

/** Web: no local notifications. */
export class UnsupportedNotificationService implements NotificationService {
  async getPermission(): Promise<NotificationPermission> {
    return 'blocked';
  }

  async requestPermission(): Promise<NotificationPermission> {
    return 'blocked';
  }

  async ensureChannels(): Promise<void> {}

  async listScheduled(): Promise<Result<readonly ScheduledNotification[], AppError>> {
    return ok([]);
  }

  async schedule(_notification: PlannedNotification): Promise<Result<void, AppError>> {
    return err(new AppError('configuration', 'Local notifications are not supported on web'));
  }

  async present(_notification: ImmediateNotification): Promise<Result<void, AppError>> {
    return err(new AppError('configuration', 'Local notifications are not supported on web'));
  }

  async cancel(_identifiers: readonly string[]): Promise<void> {}

  async dismissPresented(): Promise<void> {}
}
