import { type AppError } from '@/core/errors/AppError';
import { type SupportedLanguage } from '@/core/i18n/languages';
import { type Result } from '@/core/result';
import { type LocalTime } from '@/features/itinerary/domain/localTime';
import { type LocalDate } from '@/features/trips/domain/localDate';

import {
  type ImmediateNotification,
  type NotificationPermission,
  type PlannedNotification,
  type ScheduledNotification,
} from './Notification';
import { type NotificationSettings } from './NotificationSettings';

/** The device's current time zone. Trip dates and activity times have none, so reminders follow the device. */
export interface DeviceTimeZone {
  /** The instant `date` at `time` on the device's wall clock. */
  toEpochMs(date: LocalDate, time: LocalTime): number;
  /** The device's calendar date at `epochMs`. */
  localDateAt(epochMs: number): LocalDate;
}

/**
 * Local notifications on the OS. Implementations log failures instead of throwing:
 * reads fall back to safe values and writes return `err`.
 */
export interface NotificationService {
  getPermission(): Promise<NotificationPermission>;
  /** Shows the system prompt when it can still be shown; otherwise returns the current permission. */
  requestPermission(): Promise<NotificationPermission>;
  /**
   * Creates the Android channels (Android 13 needs one before the prompt), or renames them when
   * `names` differ from those last applied. Without `names`, existing channels are kept. No-op elsewhere.
   */
  ensureChannels(names?: NotificationChannelNames): Promise<void>;
  listScheduled(): Promise<Result<readonly ScheduledNotification[], AppError>>;
  /** Schedules (or replaces, same identifier) a reminder at `fireAt`. */
  schedule(notification: PlannedNotification): Promise<Result<void, AppError>>;
  /** Shows a notification now. */
  present(notification: ImmediateNotification): Promise<Result<void, AppError>>;
  cancel(identifiers: readonly string[]): Promise<void>;
  /** Removes Wanderly's already-delivered notifications from the notification centre (others' stay). */
  dismissPresented(): Promise<void>;
}

/** What reconcile remembers between runs (and for the background task). */
export interface NotificationState {
  /** The account the scheduled notifications belong to, or `null` after sign-out. */
  readonly ownerId: string | null;
  /** Trip id → the threshold (percent) an alert was already sent for. */
  readonly budgetAlerted: Readonly<Record<string, number>>;
  /**
   * The account `budgetAlerted` belongs to once `ownerId` is cleared (sign-out, session expiry),
   * so the same account signing back in isn't alerted again. Absent while `ownerId` says it.
   */
  readonly budgetAlertedOwnerId?: string;
}

export const EMPTY_NOTIFICATION_STATE: NotificationState = { ownerId: null, budgetAlerted: {} };

export interface NotificationRepository {
  loadSettings(): Promise<Result<NotificationSettings, AppError>>;
  saveSettings(settings: NotificationSettings): Promise<Result<void, AppError>>;
  loadState(): Promise<Result<NotificationState, AppError>>;
  saveState(state: NotificationState): Promise<Result<void, AppError>>;
}

/** The facts a notification's text is written from. */
export type NotificationTextRequest =
  | {
      readonly kind: 'tripUpcoming';
      readonly tripTitle: string;
      readonly destination: string;
      readonly daysBefore: number;
    }
  | { readonly kind: 'tripStart'; readonly tripTitle: string; readonly destination: string }
  | {
      readonly kind: 'activity';
      readonly activityTitle: string;
      readonly tripTitle: string;
      readonly startTime: LocalTime;
      readonly minutesBefore: number;
    }
  | { readonly kind: 'budget'; readonly tripTitle: string; readonly percent: number };

export interface NotificationContent {
  readonly title: string;
  readonly body: string;
}

export type NotificationCopy = (request: NotificationTextRequest) => NotificationContent;

/** Android channel names, shown in the system's notification settings for the app. */
export interface NotificationChannelNames {
  readonly reminders: string;
  readonly budget: string;
}

/** Localised notification text. */
export interface NotificationText {
  forLanguage(language: SupportedLanguage): NotificationCopy;
  channelNames(language: SupportedLanguage): NotificationChannelNames;
}

/** The periodic background refresh (expo-background-task). The OS decides when it actually runs. */
export interface BackgroundRefreshService {
  /** False where background tasks can't run (web). */
  readonly supported: boolean;
  register(): Promise<void>;
  unregister(): Promise<void>;
}

/** Taps on Wanderly notifications, including the one that launched the app. */
export interface NotificationResponses {
  /** `data` is what the tapped notification carried (untrusted). */
  subscribe(listener: (data: unknown) => void): () => void;
}
