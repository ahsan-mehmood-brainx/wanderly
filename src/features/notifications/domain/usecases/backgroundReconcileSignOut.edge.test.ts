import { type AppDependencies } from '@/core/di/AppDependencies';
import { DEFAULT_PREFERENCES } from '@/features/preferences/domain/Preferences';
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

import { parseNotificationData, type PlannedNotification } from '../Notification';

/** 1 June 2027, 12:00 UTC: two weeks before the trip. */
const NOW = Date.UTC(2027, 5, 1, 12);

const TRIP = storedTrip({ id: 'trip-1', startDate: '2027-06-15', endDate: '2027-06-20' });
const ACTIVITY = activity({ id: 'act-1', tripId: 'trip-1', date: '2027-06-16', startTime: '14:30' });
const OTHER_TRIP = storedTrip({ id: 'trip-2', title: 'Kyoto', startDate: '2027-07-01', endDate: '2027-07-04' });

async function setup() {
  const service = new FakeNotificationService();
  service.permission = 'granted';
  const background = new FakeBackgroundRefreshService();
  const ownerProvider = new FakeTripOwnerProvider(TRIP_OWNER);
  const deps = createTestDependencies({
    notificationService: service,
    backgroundRefreshService: background,
    tripOwnerProvider: ownerProvider,
    clock: new ManualClock(NOW),
    notificationTimeZone: new FixedOffsetTimeZone(0),
    preferencesRepository: new MockPreferencesRepository({
      ...DEFAULT_PREFERENCES,
      notifications: { tripReminders: true, budgetAlerts: false },
    }),
  });
  for (const [owner, trip, activities] of [
    [TRIP_OWNER, TRIP, [ACTIVITY]],
    [OTHER_TRIP_OWNER, OTHER_TRIP, []],
  ] as const) {
    const saved = await deps.tripRepository.insert(owner, trip);
    if (!saved.ok) throw saved.error;
    for (const item of activities) {
      const added = await deps.activityRepository.insert(owner, item);
      if (!added.ok) throw added.error;
    }
  }
  // A foreground run stores owner 1 for the background task; then the OS drops what was scheduled.
  await deps.reconcileNotifications.execute({ trigger: 'launch' });
  service.scheduled.clear();
  service.clearCalls();
  background.register.mockClear();
  return { deps, service, background, ownerProvider };
}

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function until(condition: () => boolean) {
  for (let attempt = 0; attempt < 500 && !condition(); attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  if (!condition()) throw new Error('Condition never became true');
}

/** Holds the first `schedule` call until the gate opens, so the test can act mid-run. */
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

describe('background-triggered reconcile running in the live app', () => {
  it('Q6 sign-out mid-run leaves nothing scheduled, no stored owner and no background refresh', async () => {
    const { deps, service, background, ownerProvider } = await setup();
    const gate = holdFirstSchedule(service);

    const running = deps.reconcileNotifications.execute({ trigger: 'background' });
    await until(() => service.schedule.mock.calls.length === 1);
    ownerProvider.ownerId = null;
    await deps.clearNotifications.execute();
    gate.resolve();
    await running;

    expect(service.identifiers()).toEqual([]);
    expect(await storedOwner(deps)).toBeNull();
    expect(background.registered).toBe(false);
  });

  it('Q6 sign-out after the last reminder was handed to the OS still leaves nothing behind', async () => {
    const { deps, service, background, ownerProvider } = await setup();
    // Hold the last of the three schedule calls.
    const gate = deferred();
    const real = service.schedule.getMockImplementation();
    if (!real) throw new Error('no implementation');
    service.schedule.mockImplementation(async (notification: PlannedNotification) => {
      if (service.schedule.mock.calls.length === 3) await gate.promise;
      return real(notification);
    });

    const running = deps.reconcileNotifications.execute({ trigger: 'background' });
    await until(() => service.schedule.mock.calls.length === 3);
    ownerProvider.ownerId = null;
    await deps.clearNotifications.execute();
    gate.resolve();
    await running;

    expect(service.identifiers()).toEqual([]);
    expect(await storedOwner(deps)).toBeNull();
    expect(background.registered).toBe(false);
  });

  it('Q6 another account signed in mid-run: the previous account reminders do not stay, the new one is reconciled', async () => {
    const { deps, service, ownerProvider } = await setup();
    const gate = holdFirstSchedule(service);

    const running = deps.reconcileNotifications.execute({ trigger: 'background' });
    await until(() => service.schedule.mock.calls.length === 1);
    ownerProvider.ownerId = OTHER_TRIP_OWNER;
    gate.resolve();
    await running;

    const owners = [...service.scheduled.values()].map(({ data }) => parseNotificationData(data)?.ownerId);
    expect(owners.every((owner) => owner === OTHER_TRIP_OWNER)).toBe(true);
    expect(service.identifiers()).toEqual(['wanderly.trip-start.trip-2', 'wanderly.trip-upcoming.trip-2']);
    expect(await storedOwner(deps)).toBe(OTHER_TRIP_OWNER);
  });

  it('Q6 a background run with nobody signed in in its own context (headless) still reconciles the stored owner', async () => {
    const { deps, service, ownerProvider } = await setup();
    ownerProvider.ownerId = null;

    const result = await deps.reconcileNotifications.execute({ trigger: 'background' });

    expect(result.ok).toBe(true);
    expect(service.identifiers()).toEqual([
      'wanderly.activity.act-1',
      'wanderly.trip-start.trip-1',
      'wanderly.trip-upcoming.trip-1',
    ]);
    expect(await storedOwner(deps)).toBe(TRIP_OWNER);
  });
});
