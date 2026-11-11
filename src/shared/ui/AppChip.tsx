import { Platform, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';

import { AppIcon } from './AppIcon';
import { AppText } from './AppText';
import { type AppIconName } from './icons';

export interface AppChipProps {
  readonly label: string;
  readonly onPress: () => void;
  /** Toggle chips (filters) announce their state; omit for action chips. */
  readonly selected?: boolean;
  readonly icon?: AppIconName;
  /** Trailing icon, e.g. `close` on a removable filter. */
  readonly trailingIcon?: AppIconName;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly disabled?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

const CHIP_HEIGHT = 36;

/**
 * Compact pill for filters, categories and quick picks. Visually 36pt tall,
 * with hit slop so the touch target is still 48pt.
 */
export function AppChip({
  label,
  onPress,
  selected,
  icon,
  trailingIcon,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
  style,
  testID,
}: AppChipProps) {
  const { colors, spacing, radii, sizes, opacity } = useAppTheme();
  const isSelected = selected === true;
  const foreground = isSelected ? 'onPrimary' : 'text';

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected: selected === undefined ? undefined : isSelected, disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={(sizes.touchTarget - CHIP_HEIGHT) / 2}
      android_ripple={Platform.OS === 'android' ? { color: colors.surfacePressed, foreground: true } : undefined}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: CHIP_HEIGHT,
          paddingHorizontal: spacing.md,
          gap: spacing.xs,
          borderRadius: radii.pill,
          borderWidth: sizes.border,
          borderColor: isSelected ? colors.primary : colors.border,
          backgroundColor: isSelected ? colors.primary : colors.surface,
        },
        pressed && Platform.OS !== 'android' ? { opacity: opacity.pressed } : null,
        disabled ? { opacity: opacity.disabled } : null,
        style,
      ]}
    >
      {icon ? <AppIcon name={icon} size="sm" color={isSelected ? 'onPrimary' : 'primary'} /> : null}
      <AppText variant="label" color={foreground} numberOfLines={1}>
        {label}
      </AppText>
      {trailingIcon ? <AppIcon name={trailingIcon} size="sm" color={foreground} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', overflow: 'hidden' },
});
