import { createI18n } from '@/core/i18n/createI18n';
import { formatTime } from '@/features/itinerary/presentation/format';

import { I18nNotificationText } from './I18nNotificationText';

const activity = (minutesBefore: number) =>
  ({ kind: 'activity', activityTitle: 'Belém Tower', tripTitle: 'Lisbon', startTime: '14:30', minutesBefore }) as const;

describe('I18nNotificationText channel names', () => {
  const text = new I18nNotificationText(createI18n('en'));

  it('names the Android channels in the language asked for', () => {
    expect(text.channelNames('en')).toEqual({ reminders: 'Trip reminders', budget: 'Budget alerts' });
    expect(text.channelNames('es')).toEqual({ reminders: 'Recordatorios de viaje', budget: 'Alertas de presupuesto' });
    expect(text.channelNames('ur').reminders).not.toBe('Trip reminders');
  });
});

describe('I18nNotificationText activity reminders', () => {
  const text = new I18nNotificationText(createI18n('en'));

  it('AC2 shows the start time in the locale style the itinerary uses, not raw HH:mm', () => {
    const { body } = text.forLanguage('en')(activity(120));

    expect(body).toContain(formatTime('14:30', 'en'));
    expect(body).not.toContain('14:30');
  });

  it('AC2 formats the day-before reminder the same way', () => {
    const { body } = text.forLanguage('en')(activity(1440));

    expect(body).toContain(formatTime('14:30', 'en'));
  });

  it('AC2 formats for the language asked for', () => {
    const { body } = text.forLanguage('es')(activity(120));

    expect(body).toContain(formatTime('14:30', 'es'));
  });
});
