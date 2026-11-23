import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { type Logger } from '@/core/logging/Logger';

import { type BackgroundRefreshService } from '../domain/repositories';

/** TaskManager task name of the periodic notification refresh. */
export const NOTIFICATION_REFRESH_TASK = 'wanderly-notification-refresh';
/** Minimum minutes between runs; the OS decides when it actually runs. */
export const NOTIFICATION_REFRESH_INTERVAL_MINUTES = 360;

/** expo-background-task adapter. No-op on web or where background tasks are restricted. */
export class ExpoBackgroundRefreshService implements BackgroundRefreshService {
  readonly supported: boolean = Platform.OS === 'ios' || Platform.OS === 'android';

  constructor(private readonly logger: Logger) {}

  async register(): Promise<void> {
    if (!this.supported) return;
    try {
      // Low Power Mode, Background App Refresh turned off or a managed device can restrict it.
      if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available) return;
      // Registering again on every reconcile would resubmit the request and could keep pushing the first run back.
      if (await TaskManager.isTaskRegisteredAsync(NOTIFICATION_REFRESH_TASK)) return;
      await BackgroundTask.registerTaskAsync(NOTIFICATION_REFRESH_TASK, {
        minimumInterval: NOTIFICATION_REFRESH_INTERVAL_MINUTES,
      });
    } catch (cause) {
      this.logger.warn('Could not register the notification refresh', { cause });
    }
  }

  async unregister(): Promise<void> {
    if (!this.supported) return;
    try {
      if (!(await TaskManager.isTaskRegisteredAsync(NOTIFICATION_REFRESH_TASK))) return;
      await BackgroundTask.unregisterTaskAsync(NOTIFICATION_REFRESH_TASK);
    } catch (cause) {
      this.logger.warn('Could not unregister the notification refresh', { cause });
    }
  }
}
