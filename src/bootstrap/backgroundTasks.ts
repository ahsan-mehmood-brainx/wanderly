import { BackgroundTaskResult } from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { type AppDependencies } from '@/core/di/AppDependencies';
import { NOTIFICATION_REFRESH_TASK } from '@/features/notifications/data/ExpoBackgroundRefreshService';

/**
 * Defines the periodic notification refresh with TaskManager. Must run at module
 * scope (before the app renders), so the OS can start the task in a headless JS context.
 * The OS decides when it runs; it only repeats the same reconcile the app runs in
 * the foreground, for the last account that was signed in.
 */
export function defineNotificationRefreshTask(
  dependencies: Pick<AppDependencies, 'reconcileNotifications' | 'logger'>,
): void {
  TaskManager.defineTask(NOTIFICATION_REFRESH_TASK, async () => {
    try {
      const result = await dependencies.reconcileNotifications.execute({ trigger: 'background' });
      return result.ok ? BackgroundTaskResult.Success : BackgroundTaskResult.Failed;
    } catch (error) {
      dependencies.logger.error('The background notification refresh threw', error);
      return BackgroundTaskResult.Failed;
    }
  });
}
