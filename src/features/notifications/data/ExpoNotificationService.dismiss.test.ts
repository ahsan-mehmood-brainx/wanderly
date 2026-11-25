import * as Notifications from 'expo-notifications';

import { createTestLogger } from '@/testing/testDependencies';

import { ExpoNotificationService, UnsupportedNotificationService } from './ExpoNotificationService';

const getPresented = jest.mocked(Notifications.getPresentedNotificationsAsync);
const dismiss = jest.mocked(Notifications.dismissNotificationAsync);

const delivered = (...identifiers: string[]) =>
  identifiers.map((identifier) => ({ request: { identifier } }) as unknown as Notifications.Notification);

describe('ExpoNotificationService.dismissPresented', () => {
  beforeEach(() => {
    getPresented.mockReset();
    dismiss.mockReset();
  });

  it("AC3 removes only Wanderly's delivered notifications from the notification centre", async () => {
    getPresented.mockResolvedValue(delivered('wanderly.budget.trip-1', 'other-app.chat', 'wanderly.trip-start.trip-2'));
    const service = new ExpoNotificationService(createTestLogger());

    await service.dismissPresented();

    expect(dismiss.mock.calls.map(([identifier]) => identifier)).toEqual([
      'wanderly.budget.trip-1',
      'wanderly.trip-start.trip-2',
    ]);
  });

  it('AC3 keeps going past one that fails and never throws', async () => {
    getPresented.mockResolvedValue(delivered('wanderly.budget.trip-1', 'wanderly.budget.trip-2'));
    dismiss.mockRejectedValueOnce(new Error('gone'));
    const logger = createTestLogger();
    const service = new ExpoNotificationService(logger);

    await expect(service.dismissPresented()).resolves.toBeUndefined();

    expect(dismiss).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('AC3 logs instead of throwing when the delivered list cannot be read', async () => {
    getPresented.mockRejectedValue(new Error('native module missing'));
    const logger = createTestLogger();

    await expect(new ExpoNotificationService(logger).dismissPresented()).resolves.toBeUndefined();

    expect(dismiss).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('is a no-op on web', async () => {
    await expect(new UnsupportedNotificationService().dismissPresented()).resolves.toBeUndefined();
  });
});
