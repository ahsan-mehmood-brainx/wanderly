import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';

import { AppIcon } from './AppIcon';
import { AppText } from './AppText';
import { type AppIconName } from './icons';

export type StateTone = 'neutral' | 'danger';

export interface StateViewProps {
  readonly icon: AppIconName;
  readonly tone: StateTone;
  readonly title: string;
  readonly message?: string;
  readonly actions?: ReactNode;
  readonly fullScreen?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

const BADGE_SIZE = 72;
/** Keeps messages to a readable line length on tablets. */
const MESSAGE_MAX_WIDTH = 360;

/** Shared layout for empty and error states: tinted icon, title, message, actions. */
export function StateView({ icon, tone, title, message, actions, fullScreen = false, style, testID }: StateViewProps) {
  const { colors, spacing } = useAppTheme();
  const badge = tone === 'danger' ? colors.dangerSurface : colors.primaryMuted;

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        { padding: spacing.xl, gap: spacing.lg },
        fullScreen ? [styles.fullScreen, { backgroundColor: colors.background }] : null,
        style,
      ]}
    >
      <View style={[styles.badge, { backgroundColor: badge }]}>
        <AppIcon name={icon} size="xl" color={tone === 'danger' ? 'danger' : 'primary'} />
      </View>
      <View style={[styles.copy, { gap: spacing.xs, maxWidth: MESSAGE_MAX_WIDTH }]}>
        <AppText variant="subtitle" align="center" accessibilityRole="header">
          {title}
        </AppText>
        {message ? (
          <AppText variant="callout" color="textSecondary" align="center">
            {message}
          </AppText>
        ) : null}
      </View>
      {actions ? <View style={[styles.actions, { gap: spacing.sm }]}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  fullScreen: { flex: 1 },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { alignItems: 'center' },
  actions: { alignItems: 'center' },
});
