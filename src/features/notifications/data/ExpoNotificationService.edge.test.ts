import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { createTestLogger } from '@/testing/testDependencies';

import { type ImmediateNotification, type PlannedNotification } from '../domain/Notification';
import { BUDGET_CHANNEL_ID, ExpoNotificationService, UnsupportedNotificationService } from './ExpoNotificationService';
import { ExpoNotificationResponses } from './ExpoNotificationResponses';

const mocked = {
  setChannel: jest.mocked(Notifications.setNotificationChannelAsync),
  schedule: jest.mocked(Notifications.scheduleNotificationAsync),
  getAll: jest.mocked(Notifications.getAllScheduledNotificationsAsync),
  addListener: jest.mocked(Notifications.addNotificationResponseReceivedListener),
  getLast: jest.mocked(Notifications.getLastNotificationResponse),
  clearLast: jest.mocked(Notifications.clearLastNotificationResponse),
};

const PLANNED: PlannedNotification = {
  identifier: 'wanderly.trip-start.trip-1',
  kind: 'tripStart',
  ownerId: '1',
  fireAt: Date.UTC(2027, 5, 15, 9),
  title: 'Trip starts today',
  body: 'Lisbon getaway',
  url: 'wanderly://trips/trip-1',
  fingerprint: 'fp',
};

const ALERT: ImmediateNotification = {
  identifier: 'wanderly.budget.trip-1',
  kind: 'budget',
  ownerId: '1',
  title: 'Budget alert',
  body: 'Lisbon getaway: 80%',
  url: 'wanderly://budget/trip-1',
};

const lastTrigger = () => (mocked.schedule.mock.calls.at(-1)?.[0] as { trigger: unknown } | undefined)?.trigger;

function response(data: unknown, actionIdentifier = Notifications.DEFAULT_ACTION_IDENTIFIER) {
  return {
    actionIdentifier,
    notification: { request: { content: { data } } },
  } as unknown as Notifications.NotificationResponse;
}

afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('ExpoNotificationService platform branches', () => {
  it('AC5 on iOS shows a budget alert with no trigger at all (right away)', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const service = new ExpoNotificationService(createTestLogger());

    await service.present(ALERT);

    expect(lastTrigger()).toBeNull();
    expect(mocked.setChannel).not.toHaveBeenCalled();
  });

  it('AC5 on Android shows a budget alert right away on the budget channel', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const service = new ExpoNotificationService(createTestLogger());

    await service.present(ALERT);

    expect(lastTrigger()).toEqual({ channelId: BUDGET_CHANNEL_ID });
  });

  it('AC4 on Android creates the channels once for many reminders', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const service = new ExpoNotificationService(createTestLogger());

    await Promise.all([service.schedule(PLANNED), service.schedule(PLANNED), service.present(ALERT)]);

    expect(mocked.setChannel).toHaveBeenCalledTimes(2);
  });

  it('AC4 on Android tries the channels again after a failure instead of remembering it', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mocked.setChannel.mockRejectedValueOnce(new Error('native'));
    const service = new ExpoNotificationService(createTestLogger());

    await service.ensureChannels();
    await service.ensureChannels();

    expect(mocked.setChannel).toHaveBeenCalledTimes(4);
  });

  it('AC2 reads a scheduled notification without data as having none', async () => {
    mocked.getAll.mockResolvedValueOnce([
      { identifier: 'wanderly.trip-start.trip-1', content: {}, trigger: null },
    ] as unknown as Notifications.NotificationRequest[]);
    const service = new ExpoNotificationService(createTestLogger());

    await expect(service.listScheduled()).resolves.toEqual({
      ok: true,
      value: [{ identifier: 'wanderly.trip-start.trip-1', data: null }],
    });
  });
});

describe('UnsupportedNotificationService (web)', () => {
  it('AC9 reports notifications as blocked and refuses to schedule or show anything, without throwing', async () => {
    const service = new UnsupportedNotificationService();

    await expect(service.getPermission()).resolves.toBe('blocked');
    await expect(service.requestPermission()).resolves.toBe('blocked');
    await expect(service.listScheduled()).resolves.toEqual({ ok: true, value: [] });
    expect((await service.schedule(PLANNED)).ok).toBe(false);
    expect((await service.present(ALERT)).ok).toBe(false);
    await expect(service.cancel(['wanderly.trip-start.trip-1'])).resolves.toBeUndefined();
  });
});

describe('ExpoNotificationResponses', () => {
  it('AC7 delivers the tap that launched the app once, and not again to a later subscriber', () => {
    mocked.getLast.mockReturnValueOnce(response({ url: 'wanderly://trips/trip-1' })).mockReturnValue(null);
    const responses = new ExpoNotificationResponses(createTestLogger());
    const first = jest.fn();
    const second = jest.fn();

    responses.subscribe(first);
    responses.subscribe(second);

    expect(first).toHaveBeenCalledWith({ url: 'wanderly://trips/trip-1' });
    expect(second).not.toHaveBeenCalled();
    expect(mocked.clearLast).toHaveBeenCalledTimes(1);
  });

  it('AC7 ignores taps on notification action buttons other than the notification itself', () => {
    const responses = new ExpoNotificationResponses(createTestLogger());
    const listener = jest.fn();

    responses.subscribe(listener);
    const deliver = mocked.addListener.mock.calls.at(-1)?.[0];
    deliver?.(response({ url: 'wanderly://trips/trip-1' }, 'snooze'));
    deliver?.(response({ url: 'wanderly://trips/trip-2' }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ url: 'wanderly://trips/trip-2' });
  });

  it('only logs when the tap listener cannot be added, and unsubscribing still works', () => {
    mocked.addListener.mockImplementationOnce(() => {
      throw new Error('native module missing');
    });
    const logger = createTestLogger();
    const responses = new ExpoNotificationResponses(logger);

    const unsubscribe = responses.subscribe(jest.fn());

    expect(logger.warn).toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });

  it('stops delivering taps after unsubscribing', () => {
    const remove = jest.fn();
    mocked.addListener.mockReturnValueOnce({ remove } as unknown as Notifications.EventSubscription);
    const responses = new ExpoNotificationResponses(createTestLogger());

    responses.subscribe(jest.fn())();

    expect(remove).toHaveBeenCalledTimes(1);
  });
});
