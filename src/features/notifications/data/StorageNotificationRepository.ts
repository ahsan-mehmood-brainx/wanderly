import { z } from 'zod';

import { AppError } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { err, ok, type Result } from '@/core/result';
import { type KeyValueStore } from '@/core/storage/KeyValueStore';

import {
  ACTIVITY_MINUTES_OPTIONS,
  BUDGET_THRESHOLD_OPTIONS,
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
  UPCOMING_TRIP_DAYS_OPTIONS,
} from '../domain/NotificationSettings';
import { EMPTY_NOTIFICATION_STATE, type NotificationRepository, type NotificationState } from '../domain/repositories';

export const NOTIFICATION_SETTINGS_STORAGE_KEY = 'notifications.settings.v1';
export const NOTIFICATION_STATE_STORAGE_KEY = 'notifications.state.v1';

/** Each field falls back on its own, so one corrupt or outdated value keeps the other choices. */
const storedSettingsSchema = z.object({
  upcomingTripDaysBefore: z
    .literal(UPCOMING_TRIP_DAYS_OPTIONS)
    .nullable()
    .catch(DEFAULT_NOTIFICATION_SETTINGS.upcomingTripDaysBefore),
  tripStartReminder: z.boolean().catch(DEFAULT_NOTIFICATION_SETTINGS.tripStartReminder),
  activityMinutesBefore: z
    .literal(ACTIVITY_MINUTES_OPTIONS)
    .nullable()
    .catch(DEFAULT_NOTIFICATION_SETTINGS.activityMinutesBefore),
  budgetThresholdPercent: z
    .literal(BUDGET_THRESHOLD_OPTIONS)
    .catch(DEFAULT_NOTIFICATION_SETTINGS.budgetThresholdPercent),
});

const storedStateSchema = z.object({
  ownerId: z.string().nullable().catch(null),
  budgetAlerted: z.record(z.string(), z.unknown()).catch({}),
  budgetAlertedOwnerId: z.string().optional().catch(undefined),
});

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Reminder settings and reconcile state as versioned JSON documents; each field falls back on its own. */
export class StorageNotificationRepository implements NotificationRepository {
  constructor(
    private readonly store: KeyValueStore,
    private readonly logger: Logger,
  ) {}

  async loadSettings(): Promise<Result<NotificationSettings, AppError>> {
    const raw = await this.read(NOTIFICATION_SETTINGS_STORAGE_KEY);
    if (!raw.ok) return raw;
    if (raw.value === null) return ok(DEFAULT_NOTIFICATION_SETTINGS);

    const parsed = storedSettingsSchema.safeParse(parseJson(raw.value));
    if (!parsed.success) {
      this.logger.warn('Stored notification settings were unreadable; using defaults');
      return ok(DEFAULT_NOTIFICATION_SETTINGS);
    }
    return ok(parsed.data);
  }

  saveSettings(settings: NotificationSettings): Promise<Result<void, AppError>> {
    return this.write(NOTIFICATION_SETTINGS_STORAGE_KEY, settings);
  }

  async loadState(): Promise<Result<NotificationState, AppError>> {
    const raw = await this.read(NOTIFICATION_STATE_STORAGE_KEY);
    if (!raw.ok) return raw;
    if (raw.value === null) return ok(EMPTY_NOTIFICATION_STATE);

    const parsed = storedStateSchema.safeParse(parseJson(raw.value));
    if (!parsed.success) {
      this.logger.warn('Stored notification state was unreadable; starting afresh');
      return ok(EMPTY_NOTIFICATION_STATE);
    }
    const budgetAlerted: Record<string, number> = {};
    for (const [tripId, threshold] of Object.entries(parsed.data.budgetAlerted)) {
      if (typeof threshold === 'number' && Number.isFinite(threshold)) budgetAlerted[tripId] = threshold;
    }
    const { ownerId, budgetAlertedOwnerId } = parsed.data;
    return ok(
      budgetAlertedOwnerId === undefined
        ? { ownerId, budgetAlerted }
        : { ownerId, budgetAlerted, budgetAlertedOwnerId },
    );
  }

  saveState(state: NotificationState): Promise<Result<void, AppError>> {
    return this.write(NOTIFICATION_STATE_STORAGE_KEY, state);
  }

  private async read(key: string): Promise<Result<string | null, AppError>> {
    try {
      return ok(await this.store.getItem(key));
    } catch (cause) {
      return err(new AppError('storage', `Failed to read ${key}`, { cause }));
    }
  }

  private async write(key: string, value: unknown): Promise<Result<void, AppError>> {
    try {
      await this.store.setItem(key, JSON.stringify(value));
      return ok(undefined);
    } catch (cause) {
      return err(new AppError('storage', `Failed to save ${key}`, { cause }));
    }
  }
}
