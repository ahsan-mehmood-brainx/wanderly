import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { type AppTheme } from '@/core/theme/themes';
import { type ThemeColors } from '@/core/theme/types';

import { AppIcon } from './AppIcon';
import { AppText, type TextColor } from './AppText';
import { type AppIconName } from './icons';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface AppButtonProps extends Omit<PressableProps, 'children' | 'style' | 'disabled'> {
  readonly label: string;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly leftIcon?: AppIconName;
  readonly rightIcon?: AppIconName;
  /** Shows a spinner, keeps the button's width, and blocks presses. */
  readonly loading?: boolean;
  readonly disabled?: boolean;
  /** Stretch to the container's width. Otherwise the button hugs its label and aligns to the container's start. */
  readonly fullWidth?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

interface VariantColors {
  readonly background: string;
  readonly pressed: string;
  readonly foreground: TextColor;
  readonly border?: string;
  readonly ripple: string;
}

function variantColors(variant: ButtonVariant, colors: ThemeColors): VariantColors {
  switch (variant) {
    case 'primary':
      return {
        background: colors.primary,
        pressed: colors.primaryPressed,
        foreground: 'onPrimary',
        ripple: 'rgba(255,255,255,0.2)',
      };
    case 'secondary':
      return {
        background: colors.secondary,
        pressed: colors.secondaryPressed,
        foreground: 'onSecondary',
        ripple: 'rgba(255,255,255,0.25)',
      };
    case 'outline':
      return {
        background: 'transparent',
        pressed: colors.surfacePressed,
        foreground: 'primary',
        border: colors.borderStrong,
        ripple: colors.surfacePressed,
      };
    case 'ghost':
      return {
        background: 'transparent',
        pressed: colors.primaryMuted,
        foreground: 'primary',
        ripple: colors.primaryMuted,
      };
    case 'danger':
      return {
        background: colors.danger,
        pressed: colors.dangerPressed,
        foreground: 'onDanger',
        ripple: 'rgba(255,255,255,0.2)',
      };
  }
}

function sizeStyle(size: ButtonSize, { sizes, spacing }: AppTheme): ViewStyle {
  const paddingHorizontal = { sm: spacing.md, md: spacing.xl, lg: spacing.xl }[size];
  return { minHeight: sizes.button[size], paddingHorizontal, gap: spacing.sm };
}

/**
 * Primary call-to-action. Uses a ripple on Android and a pressed tint on iOS,
 * so presses feel native on each platform.
 */
export function AppButton({
  label,
  variant = 'primary',
  size = 'md',
  leftIcon,
  rightIcon,
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  ...pressableProps
}: AppButtonProps) {
  const theme = useAppTheme();
  const palette = variantColors(variant, theme.colors);
  const inactive = disabled || loading;
  const iconSize = size === 'sm' ? 'sm' : 'md';
  const isAndroid = Platform.OS === 'android';

  return (
    <View
      style={[
        styles.clip,
        { borderRadius: theme.radii.pill, opacity: disabled ? theme.opacity.disabled : 1 },
        fullWidth ? styles.fullWidth : styles.intrinsic,
        style,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: inactive, busy: loading }}
        disabled={inactive}
        android_ripple={isAndroid ? { color: palette.ripple } : undefined}
        {...pressableProps}
        style={({ pressed }) => [
          styles.base,
          sizeStyle(size, theme),
          {
            backgroundColor: pressed && !isAndroid ? palette.pressed : palette.background,
            borderRadius: theme.radii.pill,
          },
          palette.border ? { borderWidth: theme.sizes.border, borderColor: palette.border } : null,
        ]}
      >
        {leftIcon ? <AppIcon name={leftIcon} size={iconSize} color={palette.foreground} /> : null}
        <AppText
          variant={size === 'sm' ? 'label' : 'headline'}
          color={palette.foreground}
          numberOfLines={1}
          style={loading ? styles.hidden : null}
        >
          {label}
        </AppText>
        {rightIcon ? <AppIcon name={rightIcon} size={iconSize} color={palette.foreground} /> : null}
        {loading ? (
          <View style={[StyleSheet.absoluteFill, styles.center]}>
            <ActivityIndicator color={theme.colors[palette.foreground]} />
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  fullWidth: { alignSelf: 'stretch' },
  intrinsic: { alignSelf: 'flex-start' },
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  hidden: { opacity: 0 },
});
