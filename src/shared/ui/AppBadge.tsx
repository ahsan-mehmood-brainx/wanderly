import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { type ThemeColors } from '@/core/theme/types';

import { AppIcon } from './AppIcon';
import { AppText } from './AppText';
import { type AppIconName } from './icons';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
export type BadgeVariant = 'soft' | 'solid';

export interface AppBadgeProps {
  readonly label: string;
  readonly tone?: BadgeTone;
  readonly variant?: BadgeVariant;
  readonly size?: 'sm' | 'md';
  readonly icon?: AppIconName;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

type ColorKey = keyof ThemeColors;

// [background, foreground] colour roles; every pair meets AA contrast.
const SOFT: Record<BadgeTone, readonly [ColorKey, ColorKey]> = {
  neutral: ['surfaceMuted', 'textSecondary'],
  primary: ['primaryMuted', 'primary'],
  success: ['successSurface', 'success'],
  warning: ['warningSurface', 'warning'],
  danger: ['dangerSurface', 'danger'],
  info: ['infoSurface', 'info'],
};

const SOLID: Record<BadgeTone, readonly [ColorKey, ColorKey]> = {
  neutral: ['text', 'background'],
  primary: ['primary', 'onPrimary'],
  success: ['success', 'background'],
  warning: ['warning', 'background'],
  danger: ['danger', 'onDanger'],
  info: ['info', 'background'],
};

/** Compact status or category label, e.g. "Popular", "Booked", "3 nights". */
export function AppBadge({
  label,
  tone = 'neutral',
  variant = 'soft',
  size = 'md',
  icon,
  style,
  testID,
}: AppBadgeProps) {
  const { colors, spacing, radii, sizes } = useAppTheme();
  const [background, foreground] = (variant === 'solid' ? SOLID : SOFT)[tone];

  return (
    <View
      testID={testID}
      style={[
        styles.base,
        {
          minHeight: sizes.badge[size],
          paddingHorizontal: size === 'sm' ? spacing.sm : spacing.md - 2,
          gap: spacing.xs,
          borderRadius: radii.pill,
          backgroundColor: colors[background],
        },
        style,
      ]}
    >
      {icon ? <AppIcon name={icon} size={size === 'sm' ? 12 : 'xs'} color={foreground} /> : null}
      <AppText
        variant="caption"
        numberOfLines={1}
        style={[styles.label, size === 'sm' ? styles.labelSmall : null, { color: colors[foreground] }]}
      >
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  label: { fontWeight: '600' },
  labelSmall: { fontSize: 11, lineHeight: 14 },
});
