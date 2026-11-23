import { type TFunction } from 'i18next';
import { type ReactElement, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { formatLocalTime } from '@/features/itinerary/domain/localTime';
import { formatTime } from '@/features/itinerary/presentation/format';
import { SettingSwitchRow } from '@/features/preferences/presentation/components/SettingSwitchRow';
import { AppLoader, AppText, InlineMessage, ListGroup, OptionGroup, Screen, type Option } from '@/shared/ui';

import {
  ACTIVITY_MINUTES_OPTIONS,
  BUDGET_THRESHOLD_OPTIONS,
  UPCOMING_TRIP_DAYS_OPTIONS,
} from '../../domain/NotificationSettings';
import { REMINDER_HOUR } from '../../domain/reminderPlanning';
import { useNotificationSettings } from '../hooks/useNotificationSettings';

const OFF = 'off';
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;

/** The option a stored value maps to: its number as text, or `off` for none. */
const optionValue = (value: number | null): string => (value === null ? OFF : String(value));

/** The allowed number an option stands for, or `null` for `off` (or anything unexpected). */
function fromOption<T extends number>(options: readonly T[], value: string): T | null {
  return options.find((option) => String(option) === value) ?? null;
}

function leadTimeLabel(t: TFunction, minutes: number): string {
  if (minutes % MINUTES_PER_DAY === 0) {
    return t('notifications.settings.daysBefore', { count: minutes / MINUTES_PER_DAY });
  }
  if (minutes % MINUTES_PER_HOUR === 0) {
    return t('notifications.settings.hoursBefore', { count: minutes / MINUTES_PER_HOUR });
  }
  return t('notifications.settings.minutesBefore', { count: minutes });
}

/** Reminder times: upcoming trip, trip start, activity and budget threshold. */
export function NotificationSettingsScreen(): ReactElement | null {
  const { t, i18n } = useTranslation();
  // From the planner's constant, so the copy can't drift from when reminders actually fire.
  const reminderTime = formatTime(formatLocalTime({ hour: REMINDER_HOUR, minute: 0 }), i18n.language);
  const { settings, loadFailed, saveFailed, update, dismissSaveError } = useNotificationSettings();

  const upcomingOptions = useMemo<Option<string>[]>(
    () => [
      { value: OFF, label: t('notifications.settings.off') },
      ...UPCOMING_TRIP_DAYS_OPTIONS.map((days) => ({
        value: String(days),
        label: t('notifications.settings.daysBefore', { count: days }),
      })),
    ],
    [t],
  );

  const activityOptions = useMemo<Option<string>[]>(
    () => [
      { value: OFF, label: t('notifications.settings.off') },
      ...ACTIVITY_MINUTES_OPTIONS.map((minutes) => ({ value: String(minutes), label: leadTimeLabel(t, minutes) })),
    ],
    [t],
  );

  const budgetOptions = useMemo<Option<string>[]>(
    () =>
      BUDGET_THRESHOLD_OPTIONS.map((percent) => ({
        value: String(percent),
        label: t('notifications.settings.percentSpent', { percent }),
      })),
    [t],
  );

  if (!settings) {
    return (
      <Screen>
        <AppLoader />
      </Screen>
    );
  }

  return (
    <Screen>
      {loadFailed ? <InlineMessage tone="warning" message={t('notifications.settings.loadError')} /> : null}
      {saveFailed ? (
        <InlineMessage
          message={t('notifications.settings.saveError')}
          dismissLabel={t('common.dismiss')}
          onDismiss={dismissSaveError}
        />
      ) : null}
      <AppText variant="caption" color="textSecondary">
        {t('notifications.settings.intro', { time: reminderTime })}
      </AppText>

      <OptionGroup
        title={t('notifications.settings.upcomingTrip')}
        focusableGroup
        options={upcomingOptions}
        value={optionValue(settings.upcomingTripDaysBefore)}
        onChange={(value) => update({ upcomingTripDaysBefore: fromOption(UPCOMING_TRIP_DAYS_OPTIONS, value) })}
      />

      <ListGroup>
        <SettingSwitchRow
          icon="flag"
          label={t('notifications.settings.tripStart')}
          value={settings.tripStartReminder}
          onChange={(enabled) => update({ tripStartReminder: enabled })}
        />
      </ListGroup>
      <AppText variant="caption" color="textSecondary">
        {t('notifications.settings.tripStartHint', { time: reminderTime })}
      </AppText>

      <OptionGroup
        title={t('notifications.settings.activity')}
        focusableGroup
        options={activityOptions}
        value={optionValue(settings.activityMinutesBefore)}
        onChange={(value) => update({ activityMinutesBefore: fromOption(ACTIVITY_MINUTES_OPTIONS, value) })}
      />

      <OptionGroup
        title={t('notifications.settings.budget')}
        focusableGroup
        options={budgetOptions}
        value={String(settings.budgetThresholdPercent)}
        onChange={(value) => {
          const budgetThresholdPercent = fromOption(BUDGET_THRESHOLD_OPTIONS, value);
          if (budgetThresholdPercent !== null) update({ budgetThresholdPercent });
        }}
      />
    </Screen>
  );
}
