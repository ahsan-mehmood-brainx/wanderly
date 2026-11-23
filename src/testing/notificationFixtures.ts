import { type AppError } from '@/core/errors/AppError';
import { createI18n } from '@/core/i18n/createI18n';
import { err, ok, type Result } from '@/core/result';
import { I18nNotificationText } from '@/features/notifications/data/I18nNotificationText';
import {
  type ImmediateNotification,
  type NotificationData,
  type NotificationPermission,
  type PlannedNotification,
  type ScheduledNotification,
} from '@/features/notifications/domain/Notification';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
} from '@/features/notifications/domain/NotificationSettings';
import {
  type BackgroundRefreshService,
  type DeviceTimeZone,
  type NotificationContent,
  type NotificationCopy,
  type NotificationResponses,
  type NotificationService,
  type NotificationText,
  type NotificationTextRequest,
} from '@/features/notifications/domain/repositories';
import { type LocalTime, parseLocalTime } from '@/features/itinerary/domain/localTime';
import { formatLocalDate, type LocalDate, parseLocalDate } from '@/features/trips/domain/localDate';

export function notificationSettings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
  return { ...DEFAULT_NOTIFICATION_SETTINGS, ...overrides };
}

/** What the OS holds for one scheduled notification in {@link FakeNotificationService}. */
export interface FakeScheduledNotification {
  readonly identifier: string;
  readonly data: unknown;
  /** `null` for one seeded with {@link FakeNotificationService.seed}. */
  readonly fireAt: number | null;
  readonly title: string;
  readonly body: string;
}

/**
 * In-memory OS notification centre. Permission starts `undetermined`; a request
 * answers with `answerPromptWith` while the prompt can still be shown. Scheduling
 * an identifier again replaces it, as on the OS. Methods are jest spies.
 */
export class FakeNotificationService implements NotificationService {
  permission: NotificationPermission = 'undetermined';
  answerPromptWith: NotificationPermission = 'granted';
  listFailure: AppError | null = null;
  readonly scheduled = new Map<string, FakeScheduledNotification>();
  readonly presented: ImmediateNotification[] = [];

  readonly getPermission = jest.fn(async (): Promise<NotificationPermission> => this.permission);

  readonly requestPermission = jest.fn(async (): Promise<NotificationPermission> => {
    if (this.permission === 'undetermined' || this.permission === 'denied') this.permission = this.answerPromptWith;
    return this.permission;
  });

  readonly ensureChannels = jest.fn(async (): Promise<void> => undefined);

  readonly listScheduled = jest.fn(async (): Promise<Result<readonly ScheduledNotification[], AppError>> => {
    if (this.listFailure) return err(this.listFailure);
    return ok([...this.scheduled.values()].map(({ identifier, data }) => ({ identifier, data })));
  });

  readonly schedule = jest.fn(async (notification: PlannedNotification): Promise<Result<void, AppError>> => {
    const data: NotificationData = {
      url: notification.url,
      ownerId: notification.ownerId,
      kind: notification.kind,
      fingerprint: notification.fingerprint,
    };
    this.scheduled.set(notification.identifier, {
      identifier: notification.identifier,
      data,
      fireAt: notification.fireAt,
      title: notification.title,
      body: notification.body,
    });
    return ok(undefined);
  });

  readonly present = jest.fn(async (notification: ImmediateNotification): Promise<Result<void, AppError>> => {
    this.presented.push(notification);
    return ok(undefined);
  });

  readonly cancel = jest.fn(async (identifiers: readonly string[]): Promise<void> => {
    for (const identifier of identifiers) this.scheduled.delete(identifier);
  });

  /** {@link presented} stays a log of what was shown; assert on this spy for dismissals. */
  readonly dismissPresented = jest.fn(async (): Promise<void> => undefined);

  /** Puts a notification on the "OS" as if an earlier run (or another app) had scheduled it. */
  seed(identifier: string, data: unknown): this {
    this.scheduled.set(identifier, { identifier, data, fireAt: null, title: '', body: '' });
    return this;
  }

  identifiers(): string[] {
    return [...this.scheduled.keys()].sort();
  }

  fireAtOf(identifier: string): number | null | undefined {
    return this.scheduled.get(identifier)?.fireAt;
  }

  /** Forgets the calls made so far, keeping what is scheduled. */
  clearCalls(): void {
    for (const spy of [
      this.getPermission,
      this.requestPermission,
      this.ensureChannels,
      this.listScheduled,
      this.schedule,
      this.present,
      this.cancel,
      this.dismissPresented,
    ]) {
      spy.mockClear();
    }
  }
}

export class FakeBackgroundRefreshService implements BackgroundRefreshService {
  supported = true;
  registered = false;

  readonly register = jest.fn(async (): Promise<void> => {
    if (this.supported) this.registered = true;
  });

  readonly unregister = jest.fn(async (): Promise<void> => {
    this.registered = false;
  });
}

/**
 * Taps delivered by hand with {@link tap}. {@link launchedWith} sets the tap that
 * launched the app: like the real adapter, it reaches the first subscriber.
 */
export class FakeNotificationResponses implements NotificationResponses {
  private readonly listeners = new Set<(data: unknown) => void>();
  private launch: { readonly data: unknown } | null = null;

  launchedWith(data: unknown): this {
    this.launch = { data };
    return this;
  }

  subscribe(listener: (data: unknown) => void): () => void {
    this.listeners.add(listener);
    const launch = this.launch;
    this.launch = null;
    if (launch) listener(launch.data);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  tap(data: unknown): void {
    for (const listener of [...this.listeners]) listener(data);
  }
}

const MS_PER_MINUTE = 60_000;

/**
 * A zone at a fixed offset from UTC (no daylight saving), in minutes east of UTC:
 * `300` is UTC+05:00. The offset can change mid-test, like a traveller crossing zones.
 */
export class FixedOffsetTimeZone implements DeviceTimeZone {
  constructor(public offsetMinutes = 0) {}

  toEpochMs(date: LocalDate, time: LocalTime): number {
    const day = parseLocalDate(date);
    const clock = parseLocalTime(time);
    if (!day || !clock) throw new RangeError(`Not a local date and time: ${date} ${time}`);
    return Date.UTC(day.year, day.month - 1, day.day, clock.hour, clock.minute) - this.offsetMinutes * MS_PER_MINUTE;
  }

  localDateAt(epochMs: number): LocalDate {
    const shifted = new Date(epochMs + this.offsetMinutes * MS_PER_MINUTE);
    return formatLocalDate({
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
    });
  }
}

/** The epoch ms of `date` at `time` in a zone `offsetMinutes` east of UTC. */
export function wallClock(date: LocalDate, time: LocalTime, offsetMinutes = 0): number {
  return new FixedOffsetTimeZone(offsetMinutes).toEpochMs(date, time);
}

/** Deterministic text: the title is the kind, the body lists every fact, so tests can see what was used. */
export const fakeNotificationCopy: NotificationCopy = (request: NotificationTextRequest): NotificationContent => ({
  title: request.kind,
  body: Object.entries(request)
    .filter(([key]) => key !== 'kind')
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' '),
});

/** The app's real English (or other language) text, as the container provides it. */
export function testNotificationText(): NotificationText {
  return new I18nNotificationText(createI18n('en'));
}
