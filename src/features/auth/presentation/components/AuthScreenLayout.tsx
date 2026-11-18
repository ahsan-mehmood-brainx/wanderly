import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/core/theme/ThemeProvider';

interface AuthScreenLayoutProps {
  readonly children: ReactNode;
  /** Screens without a navigation header pad for the status bar / notch themselves. */
  readonly headerless?: boolean;
}

/**
 * Form screen shell: keeps fields above the keyboard, lets taps reach buttons
 * while the keyboard is open, and caps the width on tablets.
 */
export function AuthScreenLayout({ children, headerless = false }: AuthScreenLayoutProps) {
  const { colors, spacing, sizes } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.fill, { backgroundColor: colors.background }]}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentInsetAdjustmentBehavior={headerless ? 'never' : 'automatic'}
        style={styles.fill}
        contentContainerStyle={[
          styles.content,
          {
            maxWidth: sizes.maxContentWidth,
            padding: spacing.xl,
            paddingTop: (headerless ? insets.top : 0) + spacing.xl,
            paddingBottom: insets.bottom + spacing.xl,
            gap: spacing.xl,
          },
        ]}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flexGrow: 1, width: '100%', alignSelf: 'center' },
});
