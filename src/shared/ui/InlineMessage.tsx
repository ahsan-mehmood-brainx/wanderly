import { Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/core/theme/tokens';

import { AppText } from './AppText';

interface InlineMessageProps {
  readonly message: string;
  readonly dismissLabel: string;
  readonly onDismiss: () => void;
}

/** Non-blocking error banner announced to screen readers as an alert. */
export function InlineMessage({ message, dismissLabel, onDismiss }: InlineMessageProps) {
  const { colors, spacing, radii } = useAppTheme();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.dangerSurface, borderColor: colors.danger, borderRadius: radii.md, padding: spacing.md, gap: spacing.md },
      ]}
    >
      {/* The role sits on the text (an accessibility element) so the dismiss button stays separately focusable. */}
      <AppText color="danger" accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.message}>
        {message}
      </AppText>
      <Pressable
        accessibilityRole="button"
        onPress={onDismiss}
        hitSlop={spacing.sm}
        style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1 }]}
      >
        <AppText variant="headline" color="danger">
          {dismissLabel}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  message: { flex: 1 },
  action: {
    minHeight: MIN_TOUCH_TARGET / 1.5,
    justifyContent: 'center',
  },
});
