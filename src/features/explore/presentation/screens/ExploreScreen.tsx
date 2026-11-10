import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppText } from '@/shared/ui/AppText';
import { Screen } from '@/shared/ui/Screen';

import { getDayPeriod, type DayPeriod } from '../../domain/dayPeriod';

interface ExploreScreenProps {
  /** Injectable clock for deterministic tests. */
  readonly now?: () => Date;
}

// Module-level so the default keeps a stable identity across renders.
const systemClock = () => new Date();

/** The app can stay mounted for hours in the background, so recompute the period on every return to the foreground. */
function useDayPeriod(now: () => Date): DayPeriod {
  const [period, setPeriod] = useState(() => getDayPeriod(now().getHours()));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setPeriod(getDayPeriod(now().getHours()));
    });
    return () => subscription.remove();
  }, [now]);

  return period;
}

export function ExploreScreen({ now = systemClock }: ExploreScreenProps) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const period = useDayPeriod(now);

  return (
    <Screen>
      <View style={{ gap: spacing.sm }}>
        <AppText variant="headline" color="primary">
          {t(`explore.greeting.${period}`)}
        </AppText>
        <AppText variant="largeTitle" accessibilityRole="header">
          {t('explore.headline')}
        </AppText>
        <AppText color="textSecondary">{t('explore.subtitle')}</AppText>
      </View>
    </Screen>
  );
}
