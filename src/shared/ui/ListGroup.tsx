import { type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';

import { AppIcon } from './AppIcon';
import { AppText } from './AppText';
import { type AppIconName } from './icons';

/** Grouped list surface (iOS inset-grouped style), matching `AppCard`'s outlined variant. */
export function ListGroup({ children }: { readonly children: ReactNode }) {
  const { colors, radii, sizes } = useAppTheme();
  return (
    <View
      style={[
        styles.group,
        {
          backgroundColor: colors.surface,
          borderColor: colors.borderStrong,
          borderRadius: radii.lg,
          borderWidth: sizes.hairline,
        },
      ]}
    >
      {children}
    </View>
  );
}

export interface ListDetailRowProps {
  readonly icon: AppIconName;
  readonly label: string;
  readonly value: string;
}

/** A read-only label and value, read as one element by screen readers. */
export function ListDetailRow({ icon, label, value }: ListDetailRowProps) {
  const { spacing } = useAppTheme();
  return (
    <View accessible style={[styles.row, { padding: spacing.lg, gap: spacing.md }]}>
      <AppIcon name={icon} size="md" color="textSecondary" />
      <View style={styles.fill}>
        <AppText variant="caption" color="textSecondary">
          {label}
        </AppText>
        <AppText selectable>{value}</AppText>
      </View>
    </View>
  );
}

export interface ListNavRowProps {
  readonly icon: AppIconName;
  readonly label: string;
  /** Current value shown before the chevron, e.g. the selected currency. */
  readonly value?: string;
  readonly onPress: () => void;
}

/** A pressable row that opens another screen or sheet. */
export function ListNavRow({ icon, label, value, onPress }: ListNavRowProps) {
  const { colors, spacing, sizes } = useAppTheme();
  const isAndroid = Platform.OS === 'android';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={value ? { text: value } : undefined}
      onPress={onPress}
      android_ripple={isAndroid ? { color: colors.surfacePressed } : undefined}
      style={({ pressed }) => [
        styles.row,
        { minHeight: sizes.touchTarget, padding: spacing.lg, gap: spacing.md },
        pressed && !isAndroid ? { backgroundColor: colors.surfacePressed } : null,
      ]}
    >
      <AppIcon name={icon} size="md" color="primary" />
      <AppText style={styles.fill}>{label}</AppText>
      {value ? (
        <AppText color="textSecondary" align="end" style={styles.value}>
          {value}
        </AppText>
      ) : null}
      <AppIcon name="chevronRight" size="sm" color="textTertiary" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  fill: { flex: 1 },
  // Long translated values wrap rather than push the label off screen.
  value: { flexShrink: 1, maxWidth: '50%' },
  group: { overflow: 'hidden' },
});
