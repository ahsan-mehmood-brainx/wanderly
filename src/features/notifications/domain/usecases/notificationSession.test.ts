import { type AppDependencies } from '@/core/di/AppDependencies';
import { DEFAULT_PREFERENCES, type NotificationPreferences } from '@/features/preferences/domain/Preferences';
import { expense } from '@/testing/budgetFixtures';
import { activity } from '@/testing/itineraryFixtures';
import { ManualClock } from '@/testing/ManualClock';
import { MockPreferencesRepository } from '@/testing/MockPreferencesRepository';
import {
  FakeBackgroundRefreshService,
  FakeNotificationService,
  FixedOffsetTimeZone,
} from '@/testing/notificationFixtures';
import { createTestDependencies } from '@/testing/testDependencies';
import { FakeTripOwnerProvider, OTHER_TRIP_OWNER, storedTrip, TRIP_OWNER } from '@/testing/tripFixtures';

import { type ReconcilePreferences, type ReconcileTrigger } from './notificationUseCases';

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
const ACTIVITY = activity({ id: 'act-1', tripId: 'trip-1', date: '2027-06-16', startTime: '14:30' });
const ALL_REMINDERS = ['wanderly.activity.act-1', 'wanderly.trip-start.trip-1', 'wanderly.trip-upcoming.trip-1'];

const OFF: NotificationPreferences = { tripReminders: false, budgetAlerts: false };
const REMINDERS_ON: NotificationPreferences = { tripReminders: true, budgetAlerts: false };
const ALERTS_ON: NotificationPreferences = { tripReminders: false, budgetAlerts: true };

function session(notifications: NotificationPreferences): ReconcilePreferences {
  return { notifications, language: DEFAULT_PREFERENCES.language };
}

function setup(stored: NotificationPreferences) {
  const service = new FakeNotificationService();
  service.permission = 'granted';
  const ownerProvider = new FakeTripOwnerProvider(TRIP_OWNER);
  const preferences = new MockPreferencesRepository({ ...DEFAULT_PREFERENCES, notifications: stored });
  const deps = createTestDependencies({
    notificationService: service,
    backgroundRefreshService: new FakeBackgroundRefreshService(),
    tripOwnerProvider: ownerProvider,
    clock: new ManualClock(NOW),
    notificationTimeZone: new FixedOffsetTimeZone(0),
    preferencesRepository: preferences,
  });
  const reconcile = (trigger: ReconcileTrigger = 'change', notifications?: NotificationPreferences) =>
    deps.reconcileNotifications.execute(notifications ? { trigger, preferences: session(notifications) } : { trigger });
  return { deps, service, ownerProvider, preferences, reconcile };
}

async function seedTrip(deps: AppDependencies, trip = TRIP, activities = [ACTIVITY], ownerId = TRIP_OWNER) {
  const saved = await deps.tripRepository.insert(ownerId, trip);
  if (!saved.ok) throw saved.error;
  for (const item of activities) {
    const added = await deps.activityRepository.insert(ownerId, item);
    if (!added.ok) throw added.error;
  }
}

async function overBudget(deps: AppDependencies, trip = TRIP, ownerId = TRIP_OWNER) {
  await seedTrip(deps, trip, [], ownerId);
  await deps.expenseRepository.insert(
    ownerId,
    expense({ id: `exp-${trip.id}`, tripId: trip.id, amount: 90_000, baseAmount: 90_000, date: '2027-06-15' }),
  );
}

describe('ReconcileNotifications follows the session preferences', () => {
  it('AC6 schedules once reminders are turned on, though storage still says off (save not settled yet)', async () => {
    const { deps, service, preferences, reconcile } = setup(OFF);
    await seedTrip(deps);

    const result = await reconcile('settings', REMINDERS_ON);

    expect(result.ok).toBe(true);
    expect(service.identifiers()).toEqual(ALL_REMINDERS);
    expect(preferences.load).not.toHaveBeenCalled();
  });

  it('AC6 cancels once reminders are turned off, though storage still says on', async () => {
    const { deps, service, reconcile } = setup(REMINDERS_ON);
    await seedTrip(deps);
    await reconcile('launch');
    expect(service.identifiers()).toEqual(ALL_REMINDERS);

    await reconcile('settings', OFF);

    expect(service.identifiers()).toEqual([]);
  });

  it('AC9 reads stored preferences when none are passed (the background task)', async () => {
    const { deps, service, preferences, ownerProvider, reconcile } = setup(REMINDERS_ON);
    await seedTrip(deps);
    await reconcile('launch', REMINDERS_ON);
    service.scheduled.clear();
    ownerProvider.ownerId = null;

    await reconcile('background');

    expect(preferences.load).toHaveBeenCalled();
    expect(service.identifiers()).toEqual(ALL_REMINDERS);
  });

  it('AC2 a call made during a run is followed with the newest preferences', async () => {
    const { deps, service, reconcile } = setup(OFF);
    await seedTrip(deps);

    await Promise.all([
      reconcile('launch', REMINDERS_ON),
      reconcile('settings', REMINDERS_ON),
      reconcile('settings', OFF),
      // A call without preferences (another screen) keeps the newest ones queued.
      reconcile('settings'),
    ]);

    expect(service.identifiers()).toEqual([]);
  });
});

describe('ClearNotifications on sign-out', () => {
  it('AC3 removes Wanderly notifications already delivered, not only pending ones', async () => {
    const { deps, service, reconcile } = setup(ALERTS_ON);
    await overBudget(deps);
    await reconcile('launch');
    expect(service.presented).toHaveLength(1);

    await deps.clearNotifications.execute();

    expect(service.dismissPresented).toHaveBeenCalledTimes(1);
  });

  it('AC5 the same account signing back in (session expiry) is not alerted again', async () => {
    const { deps, service, reconcile } = setup(ALERTS_ON);
    await overBudget(deps);
    await reconcile('launch');

    await deps.clearNotifications.execute();
    await reconcile('background');
    await reconcile('launch');

    expect(service.presented).toHaveLength(1);
    const state = await deps.notificationRepository.loadState();
    expect(state.ok && state.value.ownerId).toBe(TRIP_OWNER);
  });

  it('AC3 sign-out still forgets the owner, so the background task does nothing', async () => {
    const { deps, service, reconcile } = setup(ALERTS_ON);
    await overBudget(deps);
    await reconcile('launch');

    await deps.clearNotifications.execute();
    service.clearCalls();
    await reconcile('background');

    const state = await deps.notificationRepository.loadState();
    expect(state.ok && state.value.ownerId).toBeNull();
    expect(service.present).not.toHaveBeenCalled();
    expect(service.schedule).not.toHaveBeenCalled();
  });

  it("AC5 alerts kept for a signed-out account don't hold back the account signing in", async () => {
    const { deps, service, reconcile } = setup(ALERTS_ON);
    await overBudget(deps);
    await deps.notificationRepository.saveState({
      ownerId: null,
      budgetAlerted: { [TRIP.id]: 80 },
      budgetAlertedOwnerId: OTHER_TRIP_OWNER,
    });

    await reconcile('launch');

    expect(service.presented).toHaveLength(1);
    expect(service.presented[0]?.ownerId).toBe(TRIP_OWNER);
  });
});
