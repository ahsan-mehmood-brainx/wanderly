export const UPCOMING_TRIP_DAYS_OPTIONS = [1, 2, 3, 7] as const;
export type UpcomingTripDaysBefore = (typeof UPCOMING_TRIP_DAYS_OPTIONS)[number];

export const ACTIVITY_MINUTES_OPTIONS = [15, 30, 60, 120, 1440] as const;
export type ActivityMinutesBefore = (typeof ACTIVITY_MINUTES_OPTIONS)[number];

export const BUDGET_THRESHOLD_OPTIONS = [50, 75, 80, 90, 100] as const;
export type BudgetThresholdPercent = (typeof BUDGET_THRESHOLD_OPTIONS)[number];

/** When reminders fire. The master switches (`preferences.notifications`) decide whether they fire at all. */
export interface NotificationSettings {
  /** Days before a trip starts, or `null` for no upcoming-trip reminder. */
  readonly upcomingTripDaysBefore: UpcomingTripDaysBefore | null;
  readonly tripStartReminder: boolean;
  /** Minutes before a timed activity starts, or `null` for no activity reminder. */
  readonly activityMinutesBefore: ActivityMinutesBefore | null;
  readonly budgetThresholdPercent: BudgetThresholdPercent;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  upcomingTripDaysBefore: 1,
  tripStartReminder: true,
  activityMinutesBefore: 120,
  budgetThresholdPercent: 80,
};

export type NotificationSettingsChanges = Partial<NotificationSettings>;
