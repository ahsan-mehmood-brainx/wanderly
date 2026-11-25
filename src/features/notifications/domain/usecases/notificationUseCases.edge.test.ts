import { type AppDependencies } from '@/core/di/AppDependencies';
import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';
import { DEFAULT_PREFERENCES, type NotificationPreferences } from '@/features/preferences/domain/Preferences';
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

import { type ImmediateNotification, parseNotificationData, type PlannedNotification } from '../Notification';
import { MAX_SCHEDULED } from '../reminderPlanning';
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
const ACTIVITY = activity({ id: 'act-1', tripId: 'trip-1', date: '2027-06-16', startTime: '14:30' });

const OTHER_TRIP = storedTrip({ id: 'trip-2', title: 'Kyoto', startDate: '2027-07-01', endDate: '2027-07-04' });

interface Options {
  readonly masters?: NotificationPreferences;
}

function setup({ masters = { tripReminders: true, budgetAlerts: false } }: Options = {}) {
  const service = new FakeNotificationService();
  service.permission = 'granted';
  const background = new FakeBackgroundRefreshService();
  const ownerProvider = new FakeTripOwnerProvider(TRIP_OWNER);
  const clock = new ManualClock(NOW);
  const preferences = new MockPreferencesRepository({ ...DEFAULT_PREFERENCES, notifications: masters });
  const deps = createTestDependencies({
    notificationService: service,
    backgroundRefreshService: background,
    tripOwnerProvider: ownerProvider,
    clock,
    notificationTimeZone: new FixedOffsetTimeZone(0),
    preferencesRepository: preferences,
  });
  const reconcile = (trigger: ReconcileTrigger = 'change') => deps.reconcileNotifications.execute({ trigger });
  return { deps, service, background, ownerProvider, clock, reconcile };
}

async function seedTrip(deps: AppDependencies, trip = TRIP, activities = [ACTIVITY], ownerId = TRIP_OWNER) {
  const saved = await deps.tripRepository.insert(ownerId, trip);
  if (!saved.ok) throw saved.error;
  for (const item of activities) {
    const added = await deps.activityRepository.insert(ownerId, item);
    if (!added.ok) throw added.error;
  }
}

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Lets pending promise callbacks (and SQLite reads) run until `condition` holds. */
async function until(condition: () => boolean) {
  for (let attempt = 0; attempt < 500 && !condition(); attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  if (!condition()) throw new Error('Condition never became true');
}

/** Makes the first `schedule` call wait for the returned gate before it reaches the "OS". */
function holdFirstSchedule(service: FakeNotificationService) {
  const gate = deferred();
  const real = service.schedule.getMockImplementation();
  if (!real) throw new Error('FakeNotificationService.schedule has no implementation');
  service.schedule.mockImplementationOnce(async (notification: PlannedNotification) => {
    await gate.promise;
    return real(notification);
  });
  return gate;
}

async function storedOwner(deps: AppDependencies) {
  const state = await deps.notificationRepository.loadState();
  if (!state.ok) throw state.error;
  return state.value.ownerId;
}

function ownersOfScheduled(service: FakeNotificationService): (string | undefined)[] {
  return [...service.scheduled.values()].map(({ data }) => parseNotificationData(data)?.ownerId);
}

describe('ReconcileNotifications sign-out and account switch while a run is writing', () => {
  it('AC3 sign-out mid-reconcile leaves nothing scheduled, no stored owner and no background refresh', async () => {
    const { deps, service, background, ownerProvider, reconcile } = setup();
    await seedTrip(deps);
    const gate = holdFirstSchedule(service);

    const running = reconcile('launch');
    await until(() => service.schedule.mock.calls.length === 1);

    // Sign-out: the session goes away, then the signed-in layout unmounts and clears.
    ownerProvider.ownerId = null;
    await deps.clearNotifications.execute();
    gate.resolve();
    await running;

    expect(service.identifiers()).toEqual([]);
    expect(await storedOwner(deps)).toBeNull();
    expect(background.registered).toBe(false);
  });

  it('AC3 another account signing in mid-reconcile never leaves the previous account reminders behind', async () => {
    const { deps, service, ownerProvider, reconcile } = setup();
    await seedTrip(deps);
    await seedTrip(deps, OTHER_TRIP, [], OTHER_TRIP_OWNER);
    const gate = holdFirstSchedule(service);

    const running = reconcile('launch');
    await until(() => service.schedule.mock.calls.length === 1);

    ownerProvider.ownerId = OTHER_TRIP_OWNER;
    gate.resolve();
    await running;

    expect(ownersOfScheduled(service).every((owner) => owner === OTHER_TRIP_OWNER)).toBe(true);
    expect(service.identifiers()).toEqual(['wanderly.trip-start.trip-2', 'wanderly.trip-upcoming.trip-2']);
    expect(await storedOwner(deps)).toBe(OTHER_TRIP_OWNER);
  });

  it('AC5 sign-out mid-reconcile shows no budget alert for the signed-out account', async () => {
    const { deps, service, ownerProvider, reconcile } = setup({ masters: { tripReminders: true, budgetAlerts: true } });
    await seedTrip(deps);
    await deps.expenseRepository.insert(
      TRIP_OWNER,
      expense({ id: 'exp-big', tripId: TRIP.id, amount: 90_000, baseAmount: 90_000, date: '2027-06-15' }),
    );
    const gate = holdFirstSchedule(service);

    const running = reconcile('launch');
    await until(() => service.schedule.mock.calls.length === 1);
    ownerProvider.ownerId = null;
    await deps.clearNotifications.execute();
    gate.resolve();
    await running;

    expect(service.presented).toEqual([]);
  });
});

describe('ReconcileNotifications partial failures', () => {
  it('AC5 a budget alert the OS failed to show is shown on the next reconcile, once', async () => {
    const { deps, service, reconcile } = setup({ masters: { tripReminders: false, budgetAlerts: true } });
    await seedTrip(deps, TRIP, []);
    await deps.expenseRepository.insert(
      TRIP_OWNER,
      expense({ id: 'exp-big', tripId: TRIP.id, amount: 85_000, baseAmount: 85_000, date: '2027-06-15' }),
    );
    service.present.mockImplementationOnce(
      async (_notification: ImmediateNotification): Promise<Result<void, AppError>> =>
        err(new AppError('unknown', 'native failure')),
    );

    const first = await reconcile();
    await reconcile();
    await reconcile();

    expect(first).toEqual(ok(expect.objectContaining({ presented: 0 })));
    expect(service.present).toHaveBeenCalledTimes(2);
    expect(service.presented).toHaveLength(1);
  });

  it('AC2 one reminder the OS refuses still lets the others be scheduled, and it is retried next time', async () => {
    const { deps, service, reconcile } = setup();
    await seedTrip(deps);
    service.schedule.mockImplementationOnce(async () => err(new AppError('unknown', 'native failure')));

    const first = await reconcile();
    expect(first).toEqual(ok(expect.objectContaining({ scheduled: 2 })));
    expect(service.identifiers()).toHaveLength(2);

    const second = await reconcile();
    expect(second).toEqual(ok(expect.objectContaining({ scheduled: 1, cancelled: 0 })));
    expect(service.identifiers()).toEqual([
      'wanderly.activity.act-1',
      'wanderly.trip-start.trip-1',
      'wanderly.trip-upcoming.trip-1',
    ]);
  });
});

describe('ReconcileNotifications duplicates and foreign notifications', () => {
  it('AC2 replaces a Wanderly notification whose data is unreadable instead of keeping a duplicate', async () => {
    const { deps, service, reconcile } = setup();
    await seedTrip(deps);
    service.seed('wanderly.trip-start.trip-1', null).seed('wanderly.activity.act-1', { url: 42 });

    await reconcile();

    expect(service.identifiers()).toEqual([
      'wanderly.activity.act-1',
      'wanderly.trip-start.trip-1',
      'wanderly.trip-upcoming.trip-1',
    ]);
    expect(parseNotificationData(service.scheduled.get('wanderly.trip-start.trip-1')?.data)?.ownerId).toBe(TRIP_OWNER);
    expect(service.fireAtOf('wanderly.activity.act-1')).toBe(wallClock('2027-06-16', '12:30'));
  });

  it("AC2 never cancels another app's or an unprefixed notification", async () => {
    const { deps, service, reconcile } = setup({ masters: { tripReminders: false, budgetAlerts: false } });
    await seedTrip(deps);
    service.seed('other-app.reminder', { url: 'wanderly://trips/trip-1', ownerId: TRIP_OWNER, kind: 'tripStart' });
    service.seed('wanderlyish.reminder', {});

    await reconcile();

    expect(service.identifiers()).toEqual(['other-app.reminder', 'wanderlyish.reminder']);
    expect(service.cancel).not.toHaveBeenCalled();
  });

  it('AC2 two quick reconciles that both see an empty OS still schedule each identifier exactly once', async () => {
    const { deps, service, reconcile } = setup();
    await seedTrip(deps);

    await Promise.all([reconcile('launch'), reconcile('foreground'), reconcile('change'), reconcile('settings')]);

    const scheduledIds = service.schedule.mock.calls.map(([notification]) => notification.identifier);
    expect(new Set(scheduledIds).size).toBe(scheduledIds.length);
    expect(service.identifiers()).toHaveLength(3);
  });
});

describe('ReconcileNotifications limit of pending notifications', () => {
  it(`AC1 tops up to ${MAX_SCHEDULED} as earlier reminders pass, without rescheduling the rest`, async () => {
    const { deps, service, clock, reconcile } = setup();
    const days = 70;
    const longTrip = storedTrip({ id: 'trip-long', title: 'Long', startDate: '2027-06-10', endDate: '2027-08-31' });
    const activities = Array.from({ length: days }, (_, index) => {
      const date = new Date(Date.UTC(2027, 5, 10 + index)).toISOString().slice(0, 10);
      return activity({ id: `act-${String(index).padStart(2, '0')}`, tripId: 'trip-long', date, startTime: '18:00' });
    });
    await seedTrip(deps, longTrip, activities);

    await reconcile();
    expect(service.identifiers()).toHaveLength(MAX_SCHEDULED);
    const latestFirstRun = Math.max(...[...service.scheduled.values()].map(({ fireAt }) => fireAt ?? 0));

    // The upcoming and start reminders and the first activity day have passed.
    clock.advance(wallClock('2027-06-10', '17:00') - clock.now());
    service.clearCalls();
    // The OS drops what it delivered.
    for (const { identifier, fireAt } of [...service.scheduled.values()]) {
      if ((fireAt ?? 0) <= clock.now()) service.scheduled.delete(identifier);
    }
    await reconcile('foreground');

    expect(service.identifiers()).toHaveLength(MAX_SCHEDULED);
    expect(service.cancel).not.toHaveBeenCalled();
    const newlyScheduled = service.schedule.mock.calls.map(([notification]) => notification.fireAt);
    expect(newlyScheduled.length).toBeGreaterThan(0);
    expect(newlyScheduled.every((fireAt) => fireAt > latestFirstRun)).toBe(true);
  });
});

describe('ReconcileNotifications triggers queued during a run', () => {
  it('AC9 a background trigger queued during a signed-in run does not replace the signed-in follow-up', async () => {
    const { deps, service, ownerProvider, reconcile } = setup();
    await seedTrip(deps);
    const gate = holdFirstSchedule(service);

    const running = reconcile('launch');
    await until(() => service.schedule.mock.calls.length === 1);
    void reconcile('change');
    void reconcile('background');
    // Another account signs in; the queued follow-up must use the session, not the stored owner.
    ownerProvider.ownerId = OTHER_TRIP_OWNER;
    gate.resolve();
    await running;

    expect(await storedOwner(deps)).toBe(OTHER_TRIP_OWNER);
    expect(ownersOfScheduled(service).every((owner) => owner === OTHER_TRIP_OWNER)).toBe(true);
  });
});
