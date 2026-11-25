import { type AppDependencies } from '@/core/di/AppDependencies';
import { AppError } from '@/core/errors/AppError';
import { err, ok } from '@/core/result';
import { DEFAULT_PREFERENCES, type NotificationPreferences } from '@/features/preferences/domain/Preferences';
import { resolveDeepLink } from '@/shared/navigation/deepLinks';
import { routes } from '@/shared/navigation/routes';
import { expense } from '@/testing/budgetFixtures';
import { activity } from '@/testing/itineraryFixtures';
import { ManualClock } from '@/testing/ManualClock';
import { MockPreferencesRepository } from '@/testing/MockPreferencesRepository';
import {
  FakeBackgroundRefreshService,
  FakeNotificationService,
  FixedOffsetTimeZone,
  wallClock,
} from '@/testing/notificationFixtures';
import { createTestDependencies } from '@/testing/testDependencies';
import { FakeTripOwnerProvider, OTHER_TRIP_OWNER, storedTrip, TRIP_OWNER } from '@/testing/tripFixtures';

import { type NotificationPermission } from '../Notification';
import { type ReconcileTrigger } from './notificationUseCases';

/** 1 June 2027, 12:00 UTC: two weeks before the trip. */
const NOW = Date.UTC(2027, 5, 1, 12);

const TRIP = storedTrip({
  id: 'trip-1',
  title: 'Lisbon getaway',
  startDate: '2027-06-15',
  endDate: '2027-06-20',
  budget: 100_000,
  currency: 'USD',
});
const ACTIVITY = activity({
  id: 'act-1',
  tripId: 'trip-1',
  title: 'Belém Tower',
  date: '2027-06-16',
  startTime: '14:30',
});

const ALL_REMINDERS = ['wanderly.activity.act-1', 'wanderly.trip-start.trip-1', 'wanderly.trip-upcoming.trip-1'];

interface Options {
  readonly masters?: NotificationPreferences;
  readonly permission?: NotificationPermission;
  readonly owner?: string | null;
  readonly overrides?: Partial<AppDependencies>;
}

async function setup({
  masters = { tripReminders: true, budgetAlerts: false },
  permission = 'granted',
  owner = TRIP_OWNER,
  overrides = {},
}: Options = {}) {
  const service = new FakeNotificationService();
  service.permission = permission;
  const background = new FakeBackgroundRefreshService();
  const ownerProvider = new FakeTripOwnerProvider(owner);
  const clock = new ManualClock(NOW);
  const timeZone = new FixedOffsetTimeZone(0);
  const preferences = new MockPreferencesRepository({ ...DEFAULT_PREFERENCES, notifications: masters });
  const deps = createTestDependencies({
    notificationService: service,
    backgroundRefreshService: background,
    tripOwnerProvider: ownerProvider,
    clock,
    notificationTimeZone: timeZone,
    preferencesRepository: preferences,
    ...overrides,
  });
  const reconcile = (trigger: ReconcileTrigger = 'change') => deps.reconcileNotifications.execute({ trigger });
  return { deps, service, background, ownerProvider, clock, timeZone, preferences, reconcile };
}

async function seedTrip(deps: AppDependencies, trip = TRIP, activities = [ACTIVITY], ownerId = TRIP_OWNER) {
  const saved = await deps.tripRepository.insert(ownerId, trip);
  if (!saved.ok) throw saved.error;
  for (const item of activities) {
    const added = await deps.activityRepository.insert(ownerId, item);
    if (!added.ok) throw added.error;
  }
}

describe('ReconcileNotifications scheduling', () => {
  it('AC2 schedules every planned reminder once, at its fire time', async () => {
    const { deps, service, reconcile } = await setup();
    await seedTrip(deps);

    const result = await reconcile('launch');

    expect(result).toEqual(ok({ scheduled: 3, cancelled: 0, presented: 0 }));
    expect(service.identifiers()).toEqual(ALL_REMINDERS);
    expect(service.fireAtOf('wanderly.trip-upcoming.trip-1')).toBe(wallClock('2027-06-14', '09:00'));
    expect(service.fireAtOf('wanderly.trip-start.trip-1')).toBe(wallClock('2027-06-15', '09:00'));
    expect(service.fireAtOf('wanderly.activity.act-1')).toBe(wallClock('2027-06-16', '12:30'));
    expect(service.schedule).toHaveBeenCalledTimes(3);
  });

  it('AC2 makes no schedule or cancel calls when nothing changed', async () => {
    const { deps, service, reconcile } = await setup();
    await seedTrip(deps);
    await reconcile('launch');
    service.clearCalls();

    const result = await reconcile('foreground');

    expect(result).toEqual(ok({ scheduled: 0, cancelled: 0, presented: 0 }));
    expect(service.schedule).not.toHaveBeenCalled();
    expect(service.cancel).not.toHaveBeenCalled();
    expect(service.identifiers()).toEqual(ALL_REMINDERS);
  });

  it('AC2 writes the reminder text in English with the trip and activity names', async () => {
    const { deps, service, reconcile } = await setup();
    await seedTrip(deps);

    await reconcile();

    const reminder = service.scheduled.get('wanderly.activity.act-1');
    expect(`${reminder?.title} ${reminder?.body}`).toContain('Belém Tower');
    const start = service.scheduled.get('wanderly.trip-start.trip-1');
    expect(`${start?.title} ${start?.body}`).toContain('Lisbon getaway');
  });

  it('AC2 cancels every reminder of a deleted trip', async () => {
    const { deps, service, reconcile } = await setup();
    await seedTrip(deps);
    await reconcile();
    service.clearCalls();

    await deps.tripRepository.delete(TRIP_OWNER, TRIP.id);
    await reconcile();

    expect(service.identifiers()).toEqual([]);
    expect(service.cancel.mock.calls.flatMap(([ids]) => ids).sort()).toEqual(ALL_REMINDERS);
    expect(service.schedule).not.toHaveBeenCalled();
  });

  it('AC2 cancels every reminder of a cancelled trip', async () => {
    const { deps, service, reconcile } = await setup();
    await seedTrip(deps);
    await reconcile();

    await deps.tripRepository.update(TRIP_OWNER, { ...TRIP, cancelledAt: NOW });
    await reconcile();

    expect(service.identifiers()).toEqual([]);
  });

  it('AC2 cancels the reminder of a deleted activity and keeps the trip ones', async () => {
    const { deps, service, reconcile } = await setup();
    await seedTrip(deps);
    await reconcile();
    service.clearCalls();

    await deps.activityRepository.delete(TRIP_OWNER, ACTIVITY.id);
    await reconcile();

    expect(service.identifiers()).toEqual(['wanderly.trip-start.trip-1', 'wanderly.trip-upcoming.trip-1']);
    expect(service.cancel.mock.calls.flatMap(([ids]) => ids)).toEqual(['wanderly.activity.act-1']);
    expect(service.schedule).not.toHaveBeenCalled();
  });

  it('AC2 cancels the reminder of an activity marked done', async () => {
    const { deps, service, reconcile } = await setup();
    await seedTrip(deps);
    await reconcile();

    await deps.activityRepository.setCompleted(TRIP_OWNER, ACTIVITY.id, true, NOW);
    await reconcile();

    expect(service.identifiers()).not.toContain('wanderly.activity.act-1');
  });

  it('AC2 reschedules a re-timed activity at its new time, once', async () => {
    const { deps, service, reconcile } = await setup();
    await seedTrip(deps);
    await reconcile();
    service.clearCalls();

    await deps.activityRepository.update(TRIP_OWNER, { ...ACTIVITY, startTime: '16:00', endTime: '17:00' });
    await reconcile();

    expect(service.fireAtOf('wanderly.activity.act-1')).toBe(wallClock('2027-06-16', '14:00'));
    expect(service.schedule.mock.calls.map(([planned]) => planned.identifier)).toEqual(['wanderly.activity.act-1']);
    expect(service.identifiers()).toEqual(ALL_REMINDERS);
  });

  it('AC2 follows new trip dates, dropping an activity now outside them', async () => {
    const { deps, service, reconcile } = await setup();
    await seedTrip(deps);
    await reconcile();

    await deps.tripRepository.update(TRIP_OWNER, { ...TRIP, startDate: '2027-06-17', endDate: '2027-06-22' });
    await reconcile();

    expect(service.identifiers()).toEqual(['wanderly.trip-start.trip-1', 'wanderly.trip-upcoming.trip-1']);
    expect(service.fireAtOf('wanderly.trip-start.trip-1')).toBe(wallClock('2027-06-17', '09:00'));
    expect(service.fireAtOf('wanderly.trip-upcoming.trip-1')).toBe(wallClock('2027-06-16', '09:00'));
  });

  it('AC2 cancels stray Wanderly notifications nothing plans any more', async () => {
    const { deps, service, reconcile } = await setup();
    await seedTrip(deps);
    service.seed('wanderly.activity.deleted-long-ago', {
      url: 'wanderly://trips/trip-1/itinerary/deleted-long-ago',
      ownerId: TRIP_OWNER,
      kind: 'activity',
      fingerprint: 'old',
    });
    service.seed('wanderly.something-unreadable', 'not an object');

    await reconcile();

    expect(service.identifiers()).toEqual(ALL_REMINDERS);
  });

  it("AC2 replaces another account's notification that has the same identifier", async () => {
    const { deps, service, reconcile } = await setup();
    await seedTrip(deps);
    service.seed('wanderly.trip-start.trip-1', {
      url: 'wanderly://trips/trip-1',
      ownerId: OTHER_TRIP_OWNER,
      kind: 'tripStart',
      fingerprint: 'theirs',
    });

    await reconcile();

    expect(service.identifiers()).toEqual(ALL_REMINDERS);
    expect(service.scheduled.get('wanderly.trip-start.trip-1')?.data).toEqual(
      expect.objectContaining({ ownerId: TRIP_OWNER }),
    );
  });

  it("AC2 cancels another account's notifications that this account doesn't plan", async () => {
    const { deps, service, reconcile } = await setup();
    await seedTrip(deps);
    service.seed('wanderly.trip-upcoming.their-trip', {
      url: 'wanderly://trips/their-trip',
      ownerId: OTHER_TRIP_OWNER,
      kind: 'tripUpcoming',
      fingerprint: 'theirs',
    });

    await reconcile();

    expect(service.identifiers()).toEqual(ALL_REMINDERS);
  });

  it("AC2 only plans the signed-in account's trips", async () => {
    const { deps, service, reconcile } = await setup();
    await seedTrip(deps);
    await seedTrip(
      deps,
      storedTrip({ id: 'their-trip', startDate: '2027-06-10', endDate: '2027-06-12' }),
      [],
      OTHER_TRIP_OWNER,
    );

    await reconcile();

    expect(service.identifiers()).toEqual(ALL_REMINDERS);
  });

  it('AC6 applies new reminder times on the next reconcile', async () => {
    const { deps, service, reconcile } = await setup();
    await seedTrip(deps);
    await reconcile();

    await deps.notificationRepository.saveSettings({
      upcomingTripDaysBefore: 3,
      tripStartReminder: false,
      activityMinutesBefore: 30,
      budgetThresholdPercent: 80,
    });
    await reconcile('settings');

    expect(service.identifiers()).toEqual(['wanderly.activity.act-1', 'wanderly.trip-upcoming.trip-1']);
    expect(service.fireAtOf('wanderly.trip-upcoming.trip-1')).toBe(wallClock('2027-06-12', '09:00'));
    expect(service.fireAtOf('wanderly.activity.act-1')).toBe(wallClock('2027-06-16', '14:00'));
  });

  it('AC8 reschedules at the same wall-clock time after the device changes time zone', async () => {
    const { deps, service, timeZone, reconcile } = await setup();
    await seedTrip(deps);
    await reconcile('launch');
    service.clearCalls();

    timeZone.offsetMinutes = 300;
    await reconcile('foreground');

    expect(service.fireAtOf('wanderly.trip-start.trip-1')).toBe(wallClock('2027-06-15', '09:00', 300));
    expect(service.fireAtOf('wanderly.activity.act-1')).toBe(wallClock('2027-06-16', '12:30', 300));
    expect(service.schedule).toHaveBeenCalledTimes(3);
    expect(service.identifiers()).toEqual(ALL_REMINDERS);
  });

  it('AC2 schedules again what the OS lost (after a reboot or an OS cleanup)', async () => {
    const { deps, service, reconcile } = await setup();
    await seedTrip(deps);
    await reconcile();

    service.scheduled.clear();
    await reconcile('launch');

    expect(service.identifiers()).toEqual(ALL_REMINDERS);
  });

  it('AC1 does not schedule again reminders whose time has passed', async () => {
    const { deps, service, clock, reconcile } = await setup();
    await seedTrip(deps);
    await reconcile();

    clock.advance(wallClock('2027-06-15', '10:00') - NOW);
    service.scheduled.delete('wanderly.trip-upcoming.trip-1');
    service.scheduled.delete('wanderly.trip-start.trip-1');
    await reconcile('foreground');

    expect(service.identifiers()).toEqual(['wanderly.activity.act-1']);
  });
});

describe('ReconcileNotifications Android channel names', () => {
  it("names the channels in the reminders' language when the permission is granted", async () => {
    const { deps, service } = await setup();

    await deps.reconcileNotifications.execute({
      trigger: 'settings',
      preferences: { notifications: { tripReminders: true, budgetAlerts: false }, language: 'es' },
    });

    expect(service.ensureChannels).toHaveBeenCalledWith(deps.notificationText.channelNames('es'));
  });

  it('leaves the channels alone without the permission', async () => {
    const { service, reconcile } = await setup({ permission: 'denied' });

    await reconcile();

    expect(service.ensureChannels).not.toHaveBeenCalled();
  });
});

describe('ReconcileNotifications when nothing may be scheduled', () => {
  const seededOld = (service: FakeNotificationService) =>
    service.seed('wanderly.trip-start.trip-1', {
      url: 'wanderly://trips/trip-1',
      ownerId: TRIP_OWNER,
      kind: 'tripStart',
      fingerprint: 'old',
    });

  it.each<NotificationPermission>(['denied', 'blocked'])(
    'AC3 schedules nothing and cancels every Wanderly notification while permission is %s',
    async (permission) => {
      const { deps, service, reconcile } = await setup({ permission });
      await seedTrip(deps);
      seededOld(service).seed('other-app.reminder', { from: 'someone else' });

      const result = await reconcile();

      expect(result.ok).toBe(true);
      expect(service.schedule).not.toHaveBeenCalled();
      expect(service.identifiers()).toEqual(['other-app.reminder']);
      expect(service.requestPermission).not.toHaveBeenCalled();
    },
  );

  it('AC3 never shows the permission prompt itself, and schedules nothing until it is answered', async () => {
    const { deps, service, reconcile } = await setup({ permission: 'undetermined' });
    await seedTrip(deps);

    await reconcile();

    expect(service.requestPermission).not.toHaveBeenCalled();
    expect(service.schedule).not.toHaveBeenCalled();
  });

  it('AC3 schedules nothing and cancels everything when both switches are off', async () => {
    const { deps, service, reconcile } = await setup({ masters: { tripReminders: false, budgetAlerts: false } });
    await seedTrip(deps);
    seededOld(service);

    await reconcile();

    expect(service.schedule).not.toHaveBeenCalled();
    expect(service.present).not.toHaveBeenCalled();
    expect(service.identifiers()).toEqual([]);
  });

  it('AC3 schedules nothing and cancels everything when nobody is signed in', async () => {
    const { deps, service, ownerProvider, reconcile } = await setup();
    await seedTrip(deps);
    await reconcile();

    ownerProvider.ownerId = null;
    const result = await reconcile('foreground');

    expect(result.ok).toBe(true);
    expect(service.identifiers()).toEqual([]);
  });

  it('AC3 reports an error, without throwing, when the scheduled notifications cannot be read', async () => {
    const { deps, service, reconcile } = await setup();
    await seedTrip(deps);
    service.listFailure = new AppError('unknown', 'native module failed');

    const result = await reconcile();

    expect(result.ok).toBe(false);
    expect(service.schedule).not.toHaveBeenCalled();
  });

  it('AC3 reports a storage error, without throwing, when trips cannot be read', async () => {
    const { service, reconcile } = await setup({
      overrides: {
        tripRepository: {
          list: jest.fn(async () => err(new AppError('storage', 'disk'))),
          findById: jest.fn(),
          findOverlapping: jest.fn(),
          insert: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        },
      },
    });

    const result = await reconcile();

    expect(result).toEqual(err(expect.objectContaining({ kind: 'storage' })));
    expect(service.schedule).not.toHaveBeenCalled();
  });
});

describe('ReconcileNotifications budget alerts', () => {
  async function overBudget(cents = 80_000) {
    const context = await setup({ masters: { tripReminders: false, budgetAlerts: true } });
    await seedTrip(context.deps, TRIP, []);
    await context.deps.expenseRepository.insert(
      TRIP_OWNER,
      expense({ id: 'exp-big', tripId: TRIP.id, amount: cents, baseAmount: cents, date: '2027-06-15' }),
    );
    return context;
  }

  it('AC5 shows one alert with the trip title and percent when spending reaches 80%', async () => {
    const { service, reconcile } = await overBudget();

    const result = await reconcile();

    expect(result).toEqual(ok(expect.objectContaining({ presented: 1 })));
    expect(service.presented).toHaveLength(1);
    const [alert] = service.presented;
    expect(`${alert?.title} ${alert?.body}`).toContain('Lisbon getaway');
    expect(`${alert?.title} ${alert?.body}`).toContain('80%');
    expect(alert?.ownerId).toBe(TRIP_OWNER);
    expect(resolveDeepLink(alert?.url ?? '')).toEqual(routes.tripBudget('trip-1'));
    expect(service.schedule).not.toHaveBeenCalled();
  });

  it('AC5 does not send the alert again on later reconciles', async () => {
    const { service, reconcile } = await overBudget();

    await reconcile();
    await reconcile('foreground');
    await reconcile('background');

    expect(service.presented).toHaveLength(1);
  });

  it('AC5 re-arms after spending drops below the threshold', async () => {
    const { deps, service, reconcile } = await overBudget();
    await reconcile();

    await deps.expenseRepository.delete(TRIP_OWNER, 'exp-big');
    await reconcile();
    expect(service.presented).toHaveLength(1);

    await deps.expenseRepository.insert(
      TRIP_OWNER,
      expense({ id: 'exp-again', tripId: TRIP.id, amount: 90_000, baseAmount: 90_000, date: '2027-06-15' }),
    );
    await reconcile();

    expect(service.presented).toHaveLength(2);
  });

  it('AC5 uses the chosen threshold, and a changed threshold is evaluated against the new value', async () => {
    const { deps, service, reconcile } = await overBudget(85_000);
    await deps.notificationRepository.saveSettings({
      upcomingTripDaysBefore: 1,
      tripStartReminder: true,
      activityMinutesBefore: 120,
      budgetThresholdPercent: 90,
    });

    await reconcile('settings');
    expect(service.presented).toHaveLength(0);

    await deps.notificationRepository.saveSettings({
      upcomingTripDaysBefore: 1,
      tripStartReminder: true,
      activityMinutesBefore: 120,
      budgetThresholdPercent: 75,
    });
    await reconcile('settings');

    expect(service.presented).toHaveLength(1);
    expect(`${service.presented[0]?.title} ${service.presented[0]?.body}`).toContain('85%');
  });

  it('AC5 sends nothing while Budget alerts is off', async () => {
    const { deps, service, reconcile } = await setup({ masters: { tripReminders: true, budgetAlerts: false } });
    await seedTrip(deps, TRIP, []);
    await deps.expenseRepository.insert(
      TRIP_OWNER,
      expense({ id: 'exp-big', tripId: TRIP.id, amount: 99_000, baseAmount: 99_000, date: '2027-06-15' }),
    );

    await reconcile();

    expect(service.presented).toEqual([]);
  });

  it('AC5 sends nothing while permission is not granted', async () => {
    const context = await setup({ masters: { tripReminders: false, budgetAlerts: true }, permission: 'denied' });
    await seedTrip(context.deps, TRIP, []);
    await context.deps.expenseRepository.insert(
      TRIP_OWNER,
      expense({ id: 'exp-big', tripId: TRIP.id, amount: 99_000, baseAmount: 99_000, date: '2027-06-15' }),
    );

    await context.reconcile();

    expect(context.service.presented).toEqual([]);
  });
});

describe('ReconcileNotifications owner and background refresh', () => {
  it('AC9 remembers the signed-in owner for the background task', async () => {
    const { deps, reconcile } = await setup();
    await seedTrip(deps);

    await reconcile('launch');

    const state = await deps.notificationRepository.loadState();
    expect(state.ok && state.value.ownerId).toBe(TRIP_OWNER);
  });

  it('AC9 registers the background refresh while a reminder type is on', async () => {
    const { deps, background, reconcile } = await setup();
    await seedTrip(deps);

    await reconcile('launch');

    expect(background.register).toHaveBeenCalled();
    expect(background.registered).toBe(true);
  });

  it('AC9 registers the background refresh for budget alerts alone too', async () => {
    const { background, reconcile } = await setup({ masters: { tripReminders: false, budgetAlerts: true } });

    await reconcile('launch');

    expect(background.registered).toBe(true);
  });

  it('AC9 unregisters it when everything is off', async () => {
    const { background, reconcile } = await setup({ masters: { tripReminders: false, budgetAlerts: false } });
    background.registered = true;

    await reconcile('settings');

    expect(background.unregister).toHaveBeenCalled();
    expect(background.registered).toBe(false);
    expect(background.register).not.toHaveBeenCalled();
  });

  it('AC9 a background run works for the last stored owner without a session', async () => {
    const { deps, service, ownerProvider, reconcile } = await setup();
    await seedTrip(deps);
    await reconcile('launch');
    service.scheduled.clear();

    ownerProvider.ownerId = null;
    const result = await reconcile('background');

    expect(result.ok).toBe(true);
    expect(service.identifiers()).toEqual(ALL_REMINDERS);
  });

  it('AC9 a background run does nothing when no owner is stored', async () => {
    const { deps, service, reconcile } = await setup({ owner: null });
    await seedTrip(deps);

    const result = await reconcile('background');

    expect(result.ok).toBe(true);
    expect(service.schedule).not.toHaveBeenCalled();
    expect(service.cancel).not.toHaveBeenCalled();
    expect(service.present).not.toHaveBeenCalled();
  });

  it("AC3 a new account's first reconcile cancels the previous account's reminders", async () => {
    const { deps, service, ownerProvider, reconcile } = await setup();
    await seedTrip(deps);
    await reconcile('launch');

    ownerProvider.ownerId = OTHER_TRIP_OWNER;
    await reconcile('launch');

    expect(service.identifiers()).toEqual([]);
    const state = await deps.notificationRepository.loadState();
    expect(state.ok && state.value.ownerId).toBe(OTHER_TRIP_OWNER);
  });
});

describe('ReconcileNotifications single flight', () => {
  it('AC2 runs one reconcile at a time and coalesces calls made meanwhile into one more run', async () => {
    const { deps, service, reconcile } = await setup();
    await seedTrip(deps);

    const results = await Promise.all([reconcile('launch'), reconcile('change'), reconcile('change')]);

    expect(results.every((result) => result.ok)).toBe(true);
    expect(service.listScheduled).toHaveBeenCalledTimes(2);
    expect(service.schedule).toHaveBeenCalledTimes(3);
    expect(service.identifiers()).toEqual(ALL_REMINDERS);
  });
});

describe('ClearNotifications', () => {
  it('AC3 cancels every Wanderly notification, forgets the owner and stops the background refresh', async () => {
    const { deps, service, background, reconcile } = await setup();
    await seedTrip(deps);
    await reconcile('launch');
    service.seed('other-app.reminder', { from: 'someone else' });

    const result = await deps.clearNotifications.execute();

    expect(result).toEqual(ok(undefined));
    expect(service.identifiers()).toEqual(['other-app.reminder']);
    expect(background.unregister).toHaveBeenCalled();
    const state = await deps.notificationRepository.loadState();
    expect(state.ok && state.value.ownerId).toBeNull();
  });
});

describe('notification permission use cases', () => {
  it('AC4 reads the permission without prompting', async () => {
    const { deps, service } = await setup({ permission: 'blocked' });

    await expect(deps.getNotificationPermission.execute()).resolves.toBe('blocked');
    expect(service.requestPermission).not.toHaveBeenCalled();
  });

  it('AC4 creates the Android channels before asking (Android 13 needs one for the prompt)', async () => {
    const { deps, service } = await setup({ permission: 'undetermined' });

    await expect(deps.requestNotificationPermission.execute('es')).resolves.toBe('granted');

    expect(service.ensureChannels).toHaveBeenCalledTimes(1);
    expect(service.ensureChannels).toHaveBeenCalledWith(deps.notificationText.channelNames('es'));
    expect(service.requestPermission).toHaveBeenCalledTimes(1);
    expect(service.ensureChannels.mock.invocationCallOrder[0]).toBeLessThan(
      service.requestPermission.mock.invocationCallOrder[0] ?? 0,
    );
  });
});

describe('notification settings use cases', () => {
  it('AC6 reads the defaults when nothing was saved', async () => {
    const { deps } = await setup();

    await expect(deps.getNotificationSettings.execute()).resolves.toEqual(
      ok({
        upcomingTripDaysBefore: 1,
        tripStartReminder: true,
        activityMinutesBefore: 120,
        budgetThresholdPercent: 80,
      }),
    );
  });

  it('AC6 merges each change into what is stored and returns the result', async () => {
    const { deps } = await setup();

    await expect(deps.saveNotificationSettings.execute({ activityMinutesBefore: 15 })).resolves.toEqual(
      ok({ upcomingTripDaysBefore: 1, tripStartReminder: true, activityMinutesBefore: 15, budgetThresholdPercent: 80 }),
    );
    await deps.saveNotificationSettings.execute({ upcomingTripDaysBefore: null });

    await expect(deps.notificationRepository.loadSettings()).resolves.toEqual(
      ok({
        upcomingTripDaysBefore: null,
        tripStartReminder: true,
        activityMinutesBefore: 15,
        budgetThresholdPercent: 80,
      }),
    );
  });

  it('AC6 keeps both of two quick changes', async () => {
    const { deps } = await setup();

    await Promise.all([
      deps.saveNotificationSettings.execute({ tripStartReminder: false }),
      deps.saveNotificationSettings.execute({ budgetThresholdPercent: 90 }),
    ]);

    await expect(deps.notificationRepository.loadSettings()).resolves.toEqual(
      ok({
        upcomingTripDaysBefore: 1,
        tripStartReminder: false,
        activityMinutesBefore: 120,
        budgetThresholdPercent: 90,
      }),
    );
  });

  it('AC6 writes nothing when the stored settings cannot be read', async () => {
    const saveSettings = jest.fn();
    const { deps } = await setup({
      overrides: {
        notificationRepository: {
          loadSettings: jest.fn(async () => err(new AppError('storage', 'disk'))),
          saveSettings,
          loadState: jest.fn(),
          saveState: jest.fn(),
        },
      },
    });

    const result = await deps.saveNotificationSettings.execute({ tripStartReminder: false });

    expect(result).toEqual(err(expect.objectContaining({ kind: 'storage' })));
    expect(saveSettings).not.toHaveBeenCalled();
  });
});
