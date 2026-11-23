import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { createTestLogger } from '@/testing/testDependencies';

import { type ImmediateNotification, type PlannedNotification } from '../domain/Notification';
import { BUDGET_CHANNEL_ID, ExpoNotificationService, REMINDERS_CHANNEL_ID } from './ExpoNotificationService';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  scheduleNotificationAsync: jest.fn(async (request: { identifier?: string }) => request.identifier ?? 'generated'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  setNotificationHandler: jest.fn(),
  AndroidImportance: { DEFAULT: 5, HIGH: 6 },
  IosAuthorizationStatus: { NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval' },
}));

const mocked = {
  getPermissions: jest.mocked(Notifications.getPermissionsAsync),
  requestPermissions: jest.mocked(Notifications.requestPermissionsAsync),
  setChannel: jest.mocked(Notifications.setNotificationChannelAsync),
  schedule: jest.mocked(Notifications.scheduleNotificationAsync),
  cancel: jest.mocked(Notifications.cancelScheduledNotificationAsync),
  getAll: jest.mocked(Notifications.getAllScheduledNotificationsAsync),
  setHandler: jest.mocked(Notifications.setNotificationHandler),
};

type Status = 'granted' | 'denied' | 'undetermined';

const permission = (status: Status, canAskAgain = true, iosStatus?: number) =>
  ({
    status,
    granted: status === 'granted',
    canAskAgain,
    expires: 'never',
    ...(iosStatus === undefined ? {} : { ios: { status: iosStatus } }),
  }) as unknown as Notifications.NotificationPermissionsStatus;

const PLANNED: PlannedNotification = {
  identifier: 'wanderly.trip-start.trip-1',
  kind: 'tripStart',
  ownerId: '1',
  fireAt: Date.UTC(2027, 5, 15, 9),
  title: 'Trip starts today',
  body: 'Lisbon getaway to Portugal',
  url: 'wanderly://trips/trip-1',
  fingerprint: 'fp-1',
};

const ALERT: ImmediateNotification = {
  identifier: 'wanderly.budget.trip-1',
  kind: 'budget',
  ownerId: '1',
  title: 'Budget alert',
  body: 'Lisbon getaway: 80% of the budget spent',
  url: 'wanderly://budget/trip-1',
};

function setup() {
  const logger = createTestLogger();
  return { logger, service: new ExpoNotificationService(logger) };
}

interface ScheduledRequest {
  readonly identifier?: string;
  readonly content: { readonly title?: string; readonly body?: string; readonly data?: Record<string, unknown> };
  readonly trigger: { readonly type?: string; readonly date?: Date | number; readonly channelId?: string } | null;
}

const lastRequest = () => mocked.schedule.mock.calls.at(-1)?.[0] as unknown as ScheduledRequest;

beforeEach(() => {
  mocked.getPermissions.mockReset().mockResolvedValue(permission('undetermined'));
  mocked.requestPermissions.mockReset().mockResolvedValue(permission('granted'));
  mocked.setChannel.mockReset().mockResolvedValue(null);
  mocked.schedule.mockReset().mockImplementation(async (request) => request.identifier ?? 'generated');
  mocked.cancel.mockReset().mockResolvedValue(undefined);
  mocked.getAll.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ExpoNotificationService permission', () => {
  it.each<[string, Notifications.NotificationPermissionsStatus, string]>([
    ['granted', permission('granted'), 'granted'],
    ['iOS provisional', permission('undetermined', true, 3), 'granted'],
    ['not asked yet', permission('undetermined'), 'undetermined'],
    ['declined, can ask again', permission('denied', true), 'denied'],
    ['declined for good', permission('denied', false), 'blocked'],
  ])('AC4 maps a permission that is %s', async (_name, answer, expected) => {
    const { service } = setup();
    mocked.getPermissions.mockResolvedValueOnce(answer);
    mocked.requestPermissions.mockResolvedValueOnce(answer);

    await expect(service.getPermission()).resolves.toBe(expected);
    await expect(service.requestPermission()).resolves.toBe(expected);
    expect(mocked.requestPermissions).toHaveBeenCalledTimes(1);
  });

  it('AC4 treats a failing permission API as denied and logs it', async () => {
    const { service, logger } = setup();
    mocked.getPermissions.mockRejectedValueOnce(new Error('native'));
    mocked.requestPermissions.mockRejectedValueOnce(new Error('native'));

    await expect(service.getPermission()).resolves.toBe('denied');
    await expect(service.requestPermission()).resolves.toBe('denied');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('shows Wanderly notifications as a banner and in the list while the app is open', async () => {
    const { service } = setup();
    mocked.getPermissions.mockResolvedValue(permission('granted'));

    await service.getPermission();

    // Not reset between tests: the handler may be installed once, when the module loads.
    expect(mocked.setHandler).toHaveBeenCalled();
    const handler = mocked.setHandler.mock.calls.at(-1)?.[0];
    const behaviour = await handler?.handleNotification({} as Notifications.Notification);
    expect(behaviour).toEqual(expect.objectContaining({ shouldShowBanner: true, shouldShowList: true }));
  });
});

describe('ExpoNotificationService channels', () => {
  it('AC4 creates the reminders and budget channels on Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const { service } = setup();

    await service.ensureChannels();

    const channels = mocked.setChannel.mock.calls.map(([id]) => id).sort();
    expect(channels).toEqual([BUDGET_CHANNEL_ID, REMINDERS_CHANNEL_ID].sort());
    expect(REMINDERS_CHANNEL_ID).toBe('reminders');
    expect(BUDGET_CHANNEL_ID).toBe('budget');
  });

  it('AC4 creates no channels on iOS', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const { service } = setup();

    await service.ensureChannels();

    expect(mocked.setChannel).not.toHaveBeenCalled();
  });

  it('names the channels in the language given, and renames them when it changes', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const { service } = setup();
    const named = () => Object.fromEntries(mocked.setChannel.mock.calls.map(([id, channel]) => [id, channel.name]));

    await service.ensureChannels({ reminders: 'Recordatorios de viaje', budget: 'Alertas de presupuesto' });
    expect(named()).toEqual({
      [REMINDERS_CHANNEL_ID]: 'Recordatorios de viaje',
      [BUDGET_CHANNEL_ID]: 'Alertas de presupuesto',
    });

    // Same names, or none (schedule/present): nothing is set again.
    await service.ensureChannels({ reminders: 'Recordatorios de viaje', budget: 'Alertas de presupuesto' });
    await service.ensureChannels();
    expect(mocked.setChannel).toHaveBeenCalledTimes(2);

    mocked.setChannel.mockClear();
    await service.ensureChannels({ reminders: 'Trip reminders', budget: 'Budget alerts' });
    expect(named()).toEqual({ [REMINDERS_CHANNEL_ID]: 'Trip reminders', [BUDGET_CHANNEL_ID]: 'Budget alerts' });
  });

  it('only logs when a channel cannot be created', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mocked.setChannel.mockRejectedValueOnce(new Error('native'));
    const { service, logger } = setup();

    await expect(service.ensureChannels()).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('ExpoNotificationService scheduling', () => {
  it('AC2 schedules a local notification at the fire time with its identifier and data', async () => {
    const { service } = setup();

    await expect(service.schedule(PLANNED)).resolves.toEqual({ ok: true, value: undefined });

    const request = lastRequest();
    expect(request.identifier).toBe('wanderly.trip-start.trip-1');
    expect(request.content).toEqual(
      expect.objectContaining({
        title: 'Trip starts today',
        body: 'Lisbon getaway to Portugal',
        data: { url: 'wanderly://trips/trip-1', ownerId: '1', kind: 'tripStart', fingerprint: 'fp-1' },
      }),
    );
    expect(request.trigger?.type).toBe('date');
    expect(new Date(request.trigger?.date ?? 0).getTime()).toBe(PLANNED.fireAt);
    expect(request.trigger?.channelId).toBe(REMINDERS_CHANNEL_ID);
  });

  it('AC2 returns an error, without throwing, when scheduling fails', async () => {
    const { service, logger } = setup();
    mocked.schedule.mockRejectedValueOnce(new Error('too many'));

    const result = await service.schedule(PLANNED);

    expect(result.ok).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('AC5 shows a budget alert right away on the budget channel', async () => {
    const { service } = setup();

    await expect(service.present(ALERT)).resolves.toEqual({ ok: true, value: undefined });

    const request = lastRequest();
    expect(request.content).toEqual(
      expect.objectContaining({
        title: 'Budget alert',
        body: 'Lisbon getaway: 80% of the budget spent',
        data: expect.objectContaining({ url: 'wanderly://budget/trip-1', ownerId: '1', kind: 'budget' }),
      }),
    );
    expect(request.trigger === null || request.trigger.date === undefined).toBe(true);
  });

  it('AC2 lists what the OS has scheduled with the data each one carries', async () => {
    const { service } = setup();
    mocked.getAll.mockResolvedValueOnce([
      {
        identifier: 'wanderly.trip-start.trip-1',
        content: { title: 't', body: 'b', data: { url: 'wanderly://trips/trip-1', ownerId: '1' } },
        trigger: { type: 'date', value: PLANNED.fireAt },
      },
      { identifier: 'other-app', content: { title: 'x', body: 'y', data: null }, trigger: null },
    ] as unknown as Notifications.NotificationRequest[]);

    await expect(service.listScheduled()).resolves.toEqual({
      ok: true,
      value: [
        { identifier: 'wanderly.trip-start.trip-1', data: { url: 'wanderly://trips/trip-1', ownerId: '1' } },
        { identifier: 'other-app', data: null },
      ],
    });
  });

  it('AC2 returns an error, without throwing, when the scheduled notifications cannot be listed', async () => {
    const { service } = setup();
    mocked.getAll.mockRejectedValueOnce(new Error('native'));

    const result = await service.listScheduled();

    expect(result.ok).toBe(false);
  });

  it('AC2 cancels each identifier, carrying on past one that fails', async () => {
    const { service, logger } = setup();
    mocked.cancel.mockRejectedValueOnce(new Error('native'));

    await expect(service.cancel(['a', 'b', 'c'])).resolves.toBeUndefined();

    expect(mocked.cancel.mock.calls.map(([id]) => id)).toEqual(['a', 'b', 'c']);
    expect(logger.warn).toHaveBeenCalled();
  });
});
