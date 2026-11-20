import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppText } from '@/shared/ui';

import { type ItineraryProgress } from '../../domain/itinerary';

interface ProgressBarProps {
  readonly progress: ItineraryProgress;
}

/** `3 of 8 done` with a bar that screen readers announce as a percentage. */
export function ProgressSummary({ progress }: ProgressBarProps) {
  const { t } = useTranslation();
  const { colors, spacing, radii } = useAppTheme();
  const percent = Math.round(progress.ratio * 100);

  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="headline">
        {t('itinerary.progress', { completed: progress.completed, total: progress.total })}
      </AppText>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('itinerary.progressLabel')}
        accessibilityValue={{ min: 0, max: 100, now: percent }}
        style={[styles.track, { borderRadius: radii.pill, backgroundColor: colors.surfaceMuted }]}
      >
        <View
          style={[styles.fill, { width: `${percent}%`, borderRadius: radii.pill, backgroundColor: colors.success }]}
        />
      </View>
    </View>
  );
}

const BAR_HEIGHT = 8;

const styles = StyleSheet.create({
  track: { height: BAR_HEIGHT, overflow: 'hidden' },
  fill: { height: BAR_HEIGHT },
});
