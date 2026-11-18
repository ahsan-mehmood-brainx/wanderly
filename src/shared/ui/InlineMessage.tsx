import { Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/core/theme/tokens';
import { type ThemeColors } from '@/core/theme/types';

import { AppIcon } from './AppIcon';
import { AppText } from './AppText';
import { type AppIconName } from './icons';

export type InlineMessageTone = 'danger' | 'warning' | 'info' | 'success';

interface InlineMessageProps {
  readonly message: string;
  /** Visual and semantic weight. `danger` (the default) is announced as an alert. */
  readonly tone?: InlineMessageTone;
  readonly title?: string;
  readonly icon?: AppIconName;
  /** Omit both to render a message that can't be dismissed (e.g. while a condition lasts). */
  readonly dismissLabel?: string;
  readonly onDismiss?: () => void;
  readonly testID?: string;
}

const TONES: Record<InlineMessageTone, { fill: keyof ThemeColors; ink: 'danger' | 'warning' | 'info' | 'success' }> = {
  danger: { fill: 'dangerSurface', ink: 'danger' },
  warning: { fill: 'warningSurface', ink: 'warning' },
  info: { fill: 'infoSurface', ink: 'info' },
  success: { fill: 'successSurface', ink: 'success' },
};

/** Non-blocking banner. Errors are announced to screen readers as alerts; other tones politely. */
export function InlineMessage({
  message,
  tone = 'danger',
  title,
  icon,
  dismissLabel,
  onDismiss,
  testID,
}: InlineMessageProps) {
  const { colors, spacing, radii } = useAppTheme();
  const { fill, ink } = TONES[tone];

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        {
          backgroundColor: colors[fill],
          borderColor: colors[ink],
          borderRadius: radii.md,
          padding: spacing.md,
          gap: spacing.md,
        },
      ]}
    >
      {icon ? <AppIcon name={icon} size="md" color={ink} /> : null}
      {/* The role sits on the text (an accessibility element) so the dismiss button stays separately focusable. */}
      <View style={[styles.message, { gap: spacing.xxs }]}>
        {title ? (
          <AppText variant="headline" color={ink}>
            {title}
          </AppText>
        ) : null}
        <AppText
          color={ink}
          accessibilityRole={tone === 'danger' ? 'alert' : undefined}
          accessibilityLiveRegion="polite"
        >
          {message}
        </AppText>
      </View>
      {dismissLabel && onDismiss ? (
        <Pressable
          accessibilityRole="button"
          onPress={onDismiss}
          hitSlop={spacing.sm}
          style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1 }]}
        >
          <AppText variant="headline" color={ink}>
            {dismissLabel}
          </AppText>
        </Pressable>
      ) : null}
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
