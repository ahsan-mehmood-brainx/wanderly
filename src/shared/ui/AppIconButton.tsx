import { Platform, Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { type ThemeColors } from '@/core/theme/types';

import { AppIcon } from './AppIcon';
import { type AppIconName } from './icons';

export type IconButtonVariant = 'plain' | 'tonal' | 'surface';

export interface AppIconButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  readonly icon: AppIconName;
  /** Required: icon-only buttons have no visible text for screen readers to read. */
  readonly accessibilityLabel: string;
  readonly variant?: IconButtonVariant;
  readonly color?: keyof ThemeColors;
  readonly style?: StyleProp<ViewStyle>;
}

const VISUAL_SIZE = 40;

/** Round, icon-only button with a full 48pt touch target. Used for header actions and inline controls. */
export function AppIconButton({
  icon,
  accessibilityLabel,
  variant = 'plain',
  color,
  disabled,
  style,
  ...pressableProps
}: AppIconButtonProps) {
  const { colors, sizes, opacity, shadows } = useAppTheme();
  const background = { plain: 'transparent', tonal: colors.primaryMuted, surface: colors.surface }[variant];
  const iconColor = color ?? (variant === 'tonal' ? 'primary' : 'text');
  const hitSlop = (sizes.touchTarget - VISUAL_SIZE) / 2;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={hitSlop}
      android_ripple={
        Platform.OS === 'android'
          ? { color: colors.surfacePressed, borderless: true, radius: VISUAL_SIZE / 2 }
          : undefined
      }
      {...pressableProps}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: background },
        variant === 'surface' ? shadows.sm : null,
        pressed && Platform.OS !== 'android' ? { opacity: opacity.pressed } : null,
        disabled ? { opacity: opacity.disabled } : null,
        style,
      ]}
    >
      <AppIcon name={icon} size="md" color={iconColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: VISUAL_SIZE,
    height: VISUAL_SIZE,
    borderRadius: VISUAL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
