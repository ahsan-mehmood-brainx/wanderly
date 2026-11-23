import { type i18n } from 'i18next';

import { type SupportedLanguage } from '@/core/i18n/languages';
import { formatTime } from '@/features/itinerary/presentation/format';

import { type NotificationChannelNames, type NotificationCopy, type NotificationText } from '../domain/repositories';

const MINUTES_PER_DAY = 1440;

/** Notification text from the app's translations, in the language asked for (not the UI's current one). */
export class I18nNotificationText implements NotificationText {
  constructor(private readonly i18n: i18n) {}

  channelNames(language: SupportedLanguage): NotificationChannelNames {
    const t = this.i18n.getFixedT(language);
    return { reminders: t('notifications.channels.reminders'), budget: t('notifications.channels.budget') };
  }

  forLanguage(language: SupportedLanguage): NotificationCopy {
    const t = this.i18n.getFixedT(language);
    return (request) => {
      switch (request.kind) {
        case 'tripUpcoming':
          return {
            title: t('notifications.content.tripUpcoming.title'),
            body: t('notifications.content.tripUpcoming.body', {
              count: request.daysBefore,
              tripTitle: request.tripTitle,
              destination: request.destination,
            }),
          };
        case 'tripStart':
          return {
            title: t('notifications.content.tripStart.title'),
            body: t('notifications.content.tripStart.body', {
              tripTitle: request.tripTitle,
              destination: request.destination,
            }),
          };
        case 'activity': {
          // The same locale style as the itinerary (`2:30 PM` in English), not the stored `14:30`.
          const time = formatTime(request.startTime, language);
          return {
            title: t('notifications.content.activity.title', { activityTitle: request.activityTitle }),
            body:
              request.minutesBefore >= MINUTES_PER_DAY
                ? t('notifications.content.activity.bodyTomorrow', { time, tripTitle: request.tripTitle })
                : t('notifications.content.activity.body', { time, tripTitle: request.tripTitle }),
          };
        }
        case 'budget':
          return {
            title: t('notifications.content.budget.title'),
            body: t('notifications.content.budget.body', { tripTitle: request.tripTitle, percent: request.percent }),
          };
      }
    };
  }
}
