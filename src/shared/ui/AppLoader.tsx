import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';

import { AppText } from './AppText';

export interface AppLoaderProps {
  /** Visible text under the spinner. Also used as the accessibility label. */
  readonly label?: string;
  readonly size?: 'small' | 'large';
  /** Fills and centres within the parent (for whole-screen loading states). */
  readonly fullScreen?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/** Native activity indicator in the brand colour, announced to screen readers as busy. */
export function AppLoader({ label, size = 'large', fullScreen = false, style, testID }: AppLoaderProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useAppTheme();

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? t('common.loading')}
      accessibilityState={{ busy: true }}
      style={[
        styles.container,
        { gap: spacing.md, padding: spacing.xl },
        fullScreen ? [styles.fullScreen, { backgroundColor: colors.background }] : null,
        style,
      ]}
    >
      <ActivityIndicator size={size} color={colors.primary} />
      {label ? (
        <AppText variant="callout" color="textSecondary" align="center">
          {label}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  fullScreen: { flex: 1 },
});
