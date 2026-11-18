import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppIcon, AppText, type AppIconName } from '@/shared/ui';

interface SlideIllustrationProps {
  readonly icon: AppIconName;
  readonly chips: readonly [Chip, Chip];
  /** Diameter of the outer ring; scales with the screen. */
  readonly size: number;
}

interface Chip {
  readonly icon: AppIconName;
  readonly label: string;
}

/**
 * Brand-coloured emblem with two floating "app moments" (a place, a flight, a
 * budget) that hint at the feature. Built from tokens, so it follows the theme
 * and needs no image assets. Decorative: the slide text carries the meaning.
 */
export function SlideIllustration({ icon, chips, size }: SlideIllustrationProps) {
  const { colors, radii, spacing, shadows } = useAppTheme();
  const inner = size * 0.6;

  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ width: size, height: size }}
    >
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.center,
          { borderRadius: size / 2, backgroundColor: colors.primaryMuted },
        ]}
      >
        <View
          style={[
            styles.center,
            { width: inner, height: inner, borderRadius: inner / 2, backgroundColor: colors.primary },
            shadows.md,
          ]}
        >
          <AppIcon name={icon} size={inner * 0.42} color="onPrimary" />
        </View>
      </View>

      {chips.map((chip, index) => (
        <View
          key={chip.label}
          style={[
            styles.chip,
            index === 0 ? { top: size * 0.08, left: -spacing.sm } : { bottom: size * 0.1, right: -spacing.sm },
            {
              backgroundColor: colors.surface,
              borderRadius: radii.pill,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              gap: spacing.xs,
            },
            shadows.md,
          ]}
        >
          <AppIcon name={chip.icon} size="sm" color="primary" />
          <AppText variant="label" numberOfLines={1}>
            {chip.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  chip: { position: 'absolute', flexDirection: 'row', alignItems: 'center' },
});
