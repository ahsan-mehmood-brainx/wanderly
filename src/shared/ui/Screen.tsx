import { type ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';

interface ScreenProps {
  readonly children: ReactNode;
}

/**
 * Scrollable screen container. `automatic` insets let iOS large-title headers
 * and the native tab bar lay out content correctly.
 */
export function Screen({ children }: ScreenProps) {
  const { colors, spacing } = useAppTheme();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={[styles.fill, { backgroundColor: colors.background }]}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl }}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
