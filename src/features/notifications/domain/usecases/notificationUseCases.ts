import { AppError, toAppError } from '@/core/errors/AppError';
import { type SupportedLanguage } from '@/core/i18n/languages';
import { type Logger } from '@/core/logging/Logger';
import { err, ok, type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';
import { type Clock } from '@/core/utils/Clock';
import { type Expense } from '@/features/budget/domain/Expense';
import { type ExpenseRepository } from '@/features/budget/domain/repositories';
import { type Activity } from '@/features/itinerary/domain/Activity';
import { type ActivityRepository } from '@/features/itinerary/domain/repositories';
import { type Preferences } from '@/features/preferences/domain/Preferences';
import { type PreferencesRepository } from '@/features/preferences/domain/PreferencesRepository';
import { resolveLanguage } from '@/features/preferences/domain/resolvePreferences';
import { type TripOwnerProvider, type TripRepository } from '@/features/trips/domain/repositories';
import { withStatus } from '@/features/trips/domain/tripStatus';

import { evaluateBudgetAlerts, type BudgetAlert } from '../budgetAlerts';
import {
  type ImmediateNotification,
  isWanderlyNotification,
  NOTIFICATION_ID_PREFIX,
  notificationLinks,
  type NotificationPermission,
  parseNotificationData,
  type PlannedNotification,
  type ScheduledNotification,
} from '../Notification';
import { type NotificationSettings, type NotificationSettingsChanges } from '../NotificationSettings';
import { isActiveTrip, planReminders } from '../reminderPlanning';
import {
  type BackgroundRefreshService,
  type DeviceTimeZone,
  EMPTY_NOTIFICATION_STATE,
  type NotificationCopy,
  type NotificationRepository,
  type NotificationService,
  type NotificationState,
  type NotificationText,
} from '../repositories';

/** What started a reconcile. `background` runs for the last stored owner, since no session is restored there. */
export type ReconcileTrigger = 'launch' | 'change' | 'foreground' | 'settings' | 'background';

/** The preferences reconcile follows: which reminder types are on, and the language of their text. */
export type ReconcilePreferences = Pick<Preferences, 'notifications' | 'language'>;

export interface ReconcileInput {
  readonly trigger: ReconcileTrigger;
  /**
   * The session's preferences, as the UI shows them. A change applies to the session before it
   * is saved (and stays if saving fails), so the signed-in app passes them instead of letting
   * reconcile race the save. Read from storage when absent (the background task).
   */
  readonly preferences?: ReconcilePreferences;
}

export interface ReconcileSummary {
  readonly scheduled: number;
  readonly cancelled: number;
  readonly presented: number;
}

const NOTHING_DONE: ReconcileSummary = { scheduled: 0, cancelled: 0, presented: 0 };

/**
 * Counts sign-outs in this JS runtime. `ClearNotifications` records one before it clears, so a
 * reconcile already running (including a background one, which has no session to watch) knows
 * its owner is gone, stops before its next write and undoes a write that landed afterwards.
 */
export class NotificationSignOuts {
  private count = 0;

  get current(): number {
    return this.count;
  }

  record(): void {
    this.count += 1;
  }
}

export interface ReconcileNotificationsDependencies {
  readonly notificationService: NotificationService;
  readonly notificationRepository: NotificationRepository;
  readonly timeZone: DeviceTimeZone;
  readonly text: NotificationText;
  readonly backgroundRefresh: BackgroundRefreshService;
  readonly preferencesRepository: Pick<PreferencesRepository, 'load'>;
  readonly tripRepository: Pick<TripRepository, 'list'>;
  readonly activityRepository: Pick<ActivityRepository, 'listByTrip'>;
  readonly expenseRepository: Pick<ExpenseRepository, 'listByTrip'>;
  readonly tripOwnerProvider: TripOwnerProvider;
  readonly signOuts: NotificationSignOuts;
  readonly clock: Clock;
  /** The device's preferred language codes, for a "system" language preference. */
  readonly deviceLanguages: () => readonly (string | null | undefined)[];
  readonly logger: Logger;
}

/** Thrown inside a run to leave it with an error result; never escapes `execute`. */
class ReconcileFailure extends Error {
  constructor(readonly error: AppError) {
    super(error.message);
  }
}

function unwrap<T>(result: Result<T, AppError>): T {
  if (!result.ok) throw new ReconcileFailure(result.error);
  return result.value;
}

/** The account `state.budgetAlerted` belongs to. */
function budgetAlertsOwner(state: NotificationState): string | null {
  return state.ownerId ?? state.budgetAlertedOwnerId ?? null;
}

/**
 * The state after sign-out: no owner, so the background task schedules nothing, but the alerts
 * already sent are kept for that account, so signing back in doesn't send them again.
 */
function signedOutState(state: NotificationState): NotificationState {
  const owner = budgetAlertsOwner(state);
  if (owner === null) return EMPTY_NOTIFICATION_STATE;
  return { ownerId: null, budgetAlerted: state.budgetAlerted, budgetAlertedOwnerId: owner };
}

/** Identifiers of Wanderly's own notifications among everything the OS has scheduled. */
function ownIdentifiers(scheduled: readonly ScheduledNotification[]): string[] {
  return scheduled.map(({ identifier }) => identifier).filter(isWanderlyNotification);
}

/**
 * Makes the OS's scheduled notifications match what should be scheduled now:
 * plans every reminder, cancels obsolete or changed ones, schedules missing ones,
 * shows due budget alerts and registers the background refresh. Idempotent and
 * single-flight. Never throws.
 */
export class ReconcileNotifications implements UseCase<ReconcileInput, Result<ReconcileSummary, AppError>> {
  private running: Promise<Result<ReconcileSummary, AppError>> | null = null;
  private pending: ReconcileInput | null = null;

  constructor(private readonly deps: ReconcileNotificationsDependencies) {}

  /** Runs now, or once more after the current run (calls made meanwhile share that one). */
  execute(input: ReconcileInput): Promise<Result<ReconcileSummary, AppError>> {
    if (this.running) {
      this.queue(input);
      return this.running;
    }
    this.running = (async () => {
      let next: ReconcileInput | null = input;
      let result: Result<ReconcileSummary, AppError> = ok(NOTHING_DONE);
      try {
        while (next !== null) {
          this.pending = null;
          result = await this.run(next);
          next = this.pending;
        }
      } finally {
        this.running = null;
        this.pending = null;
      }
      return result;
    })();
    return this.running;
  }

  /** Merges a call made during a run into the one follow-up run. */
  private queue(input: ReconcileInput): void {
    const queued = this.pending;
    // A signed-in trigger knows the owner first-hand; it wins over a queued background one.
    const trigger = queued === null || queued.trigger === 'background' ? input.trigger : queued.trigger;
    // The newest session preferences win; a call without any keeps those already queued.
    const preferences = input.preferences ?? queued?.preferences;
    this.pending = preferences ? { trigger, preferences } : { trigger };
  }

  private async run(input: ReconcileInput): Promise<Result<ReconcileSummary, AppError>> {
    try {
      return ok(await this.reconcile(input));
    } catch (cause) {
      const error = cause instanceof ReconcileFailure ? cause.error : toAppError(cause);
      this.deps.logger.error('Could not reconcile notifications', error, { trigger: input.trigger });
      return err(error);
    }
  }

  private async reconcile(input: ReconcileInput): Promise<ReconcileSummary> {
    const { trigger } = input;
    const { notificationService, notificationRepository, preferencesRepository, tripOwnerProvider, signOuts } =
      this.deps;
    const signOutsAtStart = signOuts.current;
    const signedOut = (): boolean => signOuts.current !== signOutsAtStart;

    const state = unwrap(await notificationRepository.loadState());
    const ownerId = trigger === 'background' ? state.ownerId : tripOwnerProvider.currentOwnerId();
    if (ownerId === null) {
      // In the background nobody is known yet; in the foreground nobody is signed in, so nothing may stay.
      if (trigger === 'background') return NOTHING_DONE;
      const cancelled = await this.cancel(ownIdentifiers(unwrap(await notificationService.listScheduled())));
      await this.deps.backgroundRefresh.unregister();
      return { ...NOTHING_DONE, cancelled };
    }

    const preferences = input.preferences ?? unwrap(await preferencesRepository.load());
    const settings = unwrap(await notificationRepository.loadSettings());
    const permission = await notificationService.getPermission();
    const language = resolveLanguage(preferences.language, this.deps.deviceLanguages());
    // Android shows the channel names in its settings for the app: keep them in the reminders' language.
    if (permission === 'granted') await notificationService.ensureChannels(this.deps.text.channelNames(language));
    const masters = preferences.notifications;
    const enabled = permission === 'granted' && (masters.tripReminders || masters.budgetAlerts);
    // Another account's alerts say nothing about this one's trips.
    const alerted = budgetAlertsOwner(state) === ownerId ? state.budgetAlerted : {};

    let planned: PlannedNotification[] = [];
    let alerts: readonly BudgetAlert[] = [];
    let nextAlerted = alerted;
    let copy: NotificationCopy | null = null;
    if (enabled) {
      const now = this.deps.clock.now();
      const today = this.deps.timeZone.localDateAt(now);
      const trips = unwrap(await this.deps.tripRepository.list(ownerId)).filter((trip) => isActiveTrip(trip, today));
      copy = this.deps.text.forLanguage(language);

      if (masters.tripReminders) {
        const activitiesByTrip: Record<string, readonly Activity[]> = {};
        if (settings.activityMinutesBefore !== null) {
          for (const trip of trips) {
            activitiesByTrip[trip.id] = unwrap(await this.deps.activityRepository.listByTrip(ownerId, trip.id));
          }
        }
        planned = planReminders({
          ownerId,
          trips,
          activitiesByTrip,
          settings,
          masters,
          now,
          timeZone: this.deps.timeZone,
          copy,
        });
      }

      if (masters.budgetAlerts) {
        const expensesByTrip: Record<string, readonly Expense[]> = {};
        for (const trip of trips) {
          expensesByTrip[trip.id] = unwrap(await this.deps.expenseRepository.listByTrip(ownerId, trip.id));
        }
        const evaluation = evaluateBudgetAlerts({
          trips: trips.map((trip) => withStatus(trip, today)),
          expensesByTrip,
          thresholdPercent: settings.budgetThresholdPercent,
          alerted,
        });
        alerts = evaluation.toSend;
        nextAlerted = evaluation.nextAlerted;
      }
    }

    const scheduled = unwrap(await notificationService.listScheduled());

    // Signed out, or another account signed in, while this run was reading or writing:
    // stop before the next write. A switched account is handled by a follow-up run for the
    // signed-in owner; a sign-out is cleaned up by ClearNotifications.
    const ownerLeft = (): boolean => {
      const current = tripOwnerProvider.currentOwnerId();
      // A headless background run has no session, so there only another signed-in account counts.
      const switched = trigger === 'background' ? current !== null && current !== ownerId : current !== ownerId;
      if (switched) this.pending ??= trigger === 'background' ? { trigger: 'change' } : input;
      return switched || signedOut();
    };
    if (ownerLeft()) return NOTHING_DONE;

    const wanted = new Map(planned.map((notification) => [notification.identifier, notification]));
    const upToDate = new Set<string>();
    const obsolete: string[] = [];
    for (const { identifier, data } of scheduled) {
      if (!isWanderlyNotification(identifier)) continue;
      const current = parseNotificationData(data);
      const plan = wanted.get(identifier);
      if (plan && current && current.ownerId === ownerId && current.fingerprint === plan.fingerprint) {
        upToDate.add(identifier);
      } else {
        obsolete.push(identifier);
      }
    }

    const cancelled = await this.cancel(obsolete);
    let scheduledCount = 0;
    for (const notification of planned) {
      if (upToDate.has(notification.identifier)) continue;
      if (ownerLeft()) return { scheduled: scheduledCount, cancelled, presented: 0 };
      const result = await notificationService.schedule(notification);
      if (signedOut()) {
        // Landed after ClearNotifications read what to cancel: take it back.
        await this.cancel([notification.identifier]);
        return { scheduled: scheduledCount, cancelled, presented: 0 };
      }
      if (result.ok) scheduledCount += 1;
      else this.deps.logger.warn('Could not schedule a reminder', { identifier: notification.identifier });
    }

    let presented = 0;
    const unsent = new Set<string>();
    for (const alert of alerts) {
      if (ownerLeft()) return { scheduled: scheduledCount, cancelled, presented };
      const sent = copy ? await notificationService.present(this.budgetNotification(alert, ownerId, copy)) : null;
      if (sent?.ok) presented += 1;
      else unsent.add(alert.tripId);
    }
    // An alert that couldn't be shown isn't remembered, so the next run tries again.
    const budgetAlerted = Object.fromEntries(Object.entries(nextAlerted).filter(([tripId]) => !unsent.has(tripId)));

    // Writing the owner back after a sign-out would let the background task schedule for that account again.
    if (ownerLeft()) return { scheduled: scheduledCount, cancelled, presented };
    unwrap(await notificationRepository.saveState({ ownerId, budgetAlerted }));

    if (enabled) await this.deps.backgroundRefresh.register();
    else await this.deps.backgroundRefresh.unregister();

    // Signed out while saving or registering: runs are single-flight, so nothing newer wrote meanwhile.
    if (signedOut()) {
      unwrap(await notificationRepository.saveState(signedOutState({ ownerId, budgetAlerted })));
      await this.deps.backgroundRefresh.unregister();
    }

    return { scheduled: scheduledCount, cancelled, presented };
  }

  private budgetNotification(alert: BudgetAlert, ownerId: string, copy: NotificationCopy): ImmediateNotification {
    const { title, body } = copy({
      kind: 'budget',
      tripTitle: alert.tripTitle,
      percent: Math.floor(alert.percentSpent / 100),
    });
    return {
      identifier: `${NOTIFICATION_ID_PREFIX}budget.${alert.tripId}`,
      kind: 'budget',
      ownerId,
      title,
      body,
      url: notificationLinks.budget(alert.tripId),
    };
  }

  private async cancel(identifiers: readonly string[]): Promise<number> {
    if (identifiers.length === 0) return 0;
    await this.deps.notificationService.cancel(identifiers);
    return identifiers.length;
  }
}

export interface ClearNotificationsDependencies {
  readonly notificationService: NotificationService;
  readonly notificationRepository: NotificationRepository;
  readonly backgroundRefresh: BackgroundRefreshService;
  readonly signOuts: NotificationSignOuts;
  readonly logger: Logger;
}

/**
 * Sign-out: cancels every Wanderly notification and removes those already delivered (they show
 * trip names and spending), forgets the owner and stops the background refresh.
 */
export class ClearNotifications implements UseCase<void, Result<void, AppError>> {
  constructor(private readonly deps: ClearNotificationsDependencies) {}

  async execute(): Promise<Result<void, AppError>> {
    const { notificationService, notificationRepository, backgroundRefresh, signOuts, logger } = this.deps;
    // Tell a reconcile already running (foreground or background) that its owner is gone.
    signOuts.record();
    try {
      // Forget the owner first, so a background run can't schedule for this account again.
      const previous = await notificationRepository.loadState();
      const saved = await notificationRepository.saveState(
        previous.ok ? signedOutState(previous.value) : EMPTY_NOTIFICATION_STATE,
      );
      await backgroundRefresh.unregister();
      await notificationService.dismissPresented();
      const scheduled = await notificationService.listScheduled();
      if (scheduled.ok) {
        const ours = ownIdentifiers(scheduled.value);
        if (ours.length > 0) await notificationService.cancel(ours);
      }
      const failure = !scheduled.ok ? scheduled.error : !saved.ok ? saved.error : null;
      if (failure) {
        logger.error('Could not clear every notification', failure);
        return err(failure);
      }
      return ok(undefined);
    } catch (cause) {
      const error = toAppError(cause);
      logger.error('Clearing notifications threw', error);
      return err(error);
    }
  }
}

export class GetNotificationPermission implements UseCase<void, NotificationPermission> {
  constructor(private readonly service: NotificationService) {}

  execute(): Promise<NotificationPermission> {
    return this.service.getPermission();
  }
}

/**
 * Creates the Android channels first (Android 13 shows no prompt without one), named in
 * `language` (the one the app shows), then asks.
 */
export class RequestNotificationPermission implements UseCase<SupportedLanguage, NotificationPermission> {
  constructor(
    private readonly service: NotificationService,
    private readonly text: NotificationText,
  ) {}

  async execute(language: SupportedLanguage): Promise<NotificationPermission> {
    await this.service.ensureChannels(this.text.channelNames(language));
    return this.service.requestPermission();
  }
}

export class GetNotificationSettings implements UseCase<void, Result<NotificationSettings, AppError>> {
  constructor(private readonly repository: NotificationRepository) {}

  execute(): Promise<Result<NotificationSettings, AppError>> {
    return this.repository.loadSettings();
  }
}

/** Merges a change into the stored settings, one save at a time (like `SavePreferences`). Returns what was saved. */
export class SaveNotificationSettings implements UseCase<
  NotificationSettingsChanges,
  Result<NotificationSettings, AppError>
> {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly repository: NotificationRepository,
    private readonly logger: Logger,
  ) {}

  execute(changes: NotificationSettingsChanges): Promise<Result<NotificationSettings, AppError>> {
    const run = this.queue.then(() => this.mergeAndSave(changes));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async mergeAndSave(changes: NotificationSettingsChanges): Promise<Result<NotificationSettings, AppError>> {
    try {
      const current = await this.repository.loadSettings();
      if (!current.ok) {
        this.logger.error('Could not read notification settings before saving; nothing was written', current.error);
        return err(current.error);
      }
      const next: NotificationSettings = { ...current.value, ...changes };
      const saved = await this.repository.saveSettings(next);
      if (!saved.ok) {
        this.logger.error('Could not save notification settings', saved.error);
        return err(saved.error);
      }
      return ok(next);
    } catch (error) {
      this.logger.error('Notification repository threw while saving', error);
      return err(new AppError('storage', 'Notification repository threw while saving', { cause: error }));
    }
  }
}
