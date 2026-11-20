import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppIcon, AppText, type AppIconName } from '@/shared/ui';

interface SettingSwitchRowProps {
  readonly icon: AppIconName;
  readonly label: string;
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
}

/**
 * A labelled on/off row. The whole row is the switch for screen readers and
 * touch, so the target is large and the label is announced with the state.
 */
export function SettingSwitchRow({ icon, label, value, onChange }: SettingSwitchRowProps) {
  const { colors, spacing, sizes } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={[
        styles.row,
        { minHeight: sizes.touchTarget, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.md },
      ]}
    >
      <AppIcon name={icon} size="md" color="primary" />
      <AppText style={styles.fill}>{label}</AppText>
      {/* The row is the only input path; touches on the switch fall through to it so a tap toggles once. */}
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ true: colors.primary, false: colors.border }}
          ios_backgroundColor={colors.border}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  fill: { flex: 1 },
});
