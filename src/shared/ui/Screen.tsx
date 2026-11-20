import { type ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { useLayoutDirection } from '@/core/i18n/LayoutDirectionProvider';
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
  // Set here as well as at the root: native screen containers don't reliably pass `direction` on.
  const { direction } = useLayoutDirection();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={[styles.fill, { backgroundColor: colors.background, direction }]}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl, direction }}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
