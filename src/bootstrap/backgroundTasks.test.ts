import { BackgroundTaskResult } from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { AppError } from '@/core/errors/AppError';
import { err, ok } from '@/core/result';
import { createTestLogger } from '@/testing/testDependencies';

import { defineNotificationRefreshTask } from './backgroundTasks';

jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
}));

jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));

const defineTask = jest.mocked(TaskManager.defineTask);

function define(execute: jest.Mock) {
  defineTask.mockClear();
  const logger = createTestLogger();
  defineNotificationRefreshTask({ reconcileNotifications: { execute }, logger });
  expect(defineTask).toHaveBeenCalledTimes(1);
  const [name, executor] = defineTask.mock.calls[0] ?? [];
  return { name, run: () => executor?.({ data: null, error: null, executionInfo: {} } as never), logger };
}

describe('defineNotificationRefreshTask', () => {
  it('AC9 defines wanderly-notification-refresh, which reconciles for the stored owner', async () => {
    const execute = jest.fn(async () => ok({ scheduled: 1, cancelled: 0, presented: 0 }));
    const { name, run } = define(execute);

    expect(name).toBe('wanderly-notification-refresh');
    await expect(run()).resolves.toBe(BackgroundTaskResult.Success);
    expect(execute).toHaveBeenCalledWith({ trigger: 'background' });
  });

  it('AC9 reports Failed when the reconcile fails', async () => {
    const execute = jest.fn(async () => err(new AppError('storage', 'disk')));
    const { run } = define(execute);

    await expect(run()).resolves.toBe(BackgroundTaskResult.Failed);
  });

  it('AC9 reports Failed, and logs, when the reconcile throws', async () => {
    const execute = jest.fn(async () => {
      throw new Error('boom');
    });
    const { run, logger } = define(execute);

    await expect(run()).resolves.toBe(BackgroundTaskResult.Failed);
    expect(logger.error).toHaveBeenCalled();
  });
});
