import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { createTestLogger } from '@/testing/testDependencies';

import {
  ExpoBackgroundRefreshService,
  NOTIFICATION_REFRESH_INTERVAL_MINUTES,
  NOTIFICATION_REFRESH_TASK,
} from './ExpoBackgroundRefreshService';

jest.mock('expo-background-task', () => ({
  getStatusAsync: jest.fn(async () => 2),
  registerTaskAsync: jest.fn(async () => undefined),
  unregisterTaskAsync: jest.fn(async () => undefined),
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
  BackgroundTaskResult: { Success: 1, Failed: 2 },
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskDefined: jest.fn(() => true),
  isTaskRegisteredAsync: jest.fn(async () => false),
}));

const register = jest.mocked(BackgroundTask.registerTaskAsync);
const unregister = jest.mocked(BackgroundTask.unregisterTaskAsync);
const status = jest.mocked(BackgroundTask.getStatusAsync);
const isRegistered = jest.mocked(TaskManager.isTaskRegisteredAsync);

function setup() {
  const logger = createTestLogger();
  return { logger, service: new ExpoBackgroundRefreshService(logger) };
}

beforeEach(() => {
  register.mockReset().mockResolvedValue(undefined);
  unregister.mockReset().mockResolvedValue(undefined);
  status.mockReset().mockResolvedValue(BackgroundTask.BackgroundTaskStatus.Available);
  isRegistered.mockReset().mockResolvedValue(false);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ExpoBackgroundRefreshService', () => {
  it.each(['ios', 'android'] as const)(
    'AC9 registers wanderly-notification-refresh every 6 hours at most on %s',
    async (os) => {
      jest.replaceProperty(Platform, 'OS', os);
      const { service } = setup();

      await service.register();

      expect(service.supported).toBe(true);
      expect(NOTIFICATION_REFRESH_TASK).toBe('wanderly-notification-refresh');
      expect(NOTIFICATION_REFRESH_INTERVAL_MINUTES).toBe(360);
      expect(register).toHaveBeenCalledWith('wanderly-notification-refresh', { minimumInterval: 360 });
    },
  );

  it('AC9 never registers on web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const { service } = setup();

    await service.register();

    expect(service.supported).toBe(false);
    expect(register).not.toHaveBeenCalled();
  });

  it('AC9 does not register where the OS restricts background tasks', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    status.mockResolvedValueOnce(BackgroundTask.BackgroundTaskStatus.Restricted);
    const { service } = setup();

    await service.register();

    expect(register).not.toHaveBeenCalled();
  });

  it('AC9 unregisters a registered task', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    isRegistered.mockResolvedValueOnce(true);
    const { service } = setup();

    await service.unregister();

    expect(unregister).toHaveBeenCalledWith('wanderly-notification-refresh');
  });

  it('AC9 has nothing to unregister when the task is not registered', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    isRegistered.mockResolvedValueOnce(false);
    const { service } = setup();

    await service.unregister();

    expect(unregister).not.toHaveBeenCalled();
  });

  it('AC9 only logs when registering fails', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    register.mockRejectedValueOnce(new Error('BGTaskScheduler unavailable'));
    const { service, logger } = setup();

    await expect(service.register()).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});
