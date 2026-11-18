import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/core/theme/ThemeProvider';

import { AppIconButton } from './AppIconButton';
import { AppText } from './AppText';
import { type AppIconName } from './icons';

export interface HeaderAction {
  readonly icon: AppIconName;
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
}

export interface AppHeaderProps {
  readonly title?: string;
  readonly subtitle?: string;
  /** Shows a platform back button (chevron on iOS, arrow on Android). */
  readonly onBack?: () => void;
  readonly backLabel?: string;
  /** Replaces the back button. */
  readonly leftAction?: HeaderAction;
  readonly rightActions?: readonly HeaderAction[];
  /** Adds the top safe-area inset. Use when the header is the first thing on a screen without a native header. */
  readonly withSafeArea?: boolean;
  readonly bordered?: boolean;
  readonly transparent?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * In-screen header for modals, sheets and custom screens. Stack screens should
 * prefer the native header (Expo Router `Stack.Screen` options). Follows each
 * platform's convention: centred title on iOS, leading title on Android.
 */
export function AppHeader({
  title,
  subtitle,
  onBack,
  backLabel,
  leftAction,
  rightActions = [],
  withSafeArea = false,
  bordered = false,
  transparent = false,
  style,
}: AppHeaderProps) {
  const { t } = useTranslation();
  const { colors, sizes, spacing } = useAppTheme();
  const insets = useSafeAreaInsets();
  const centered = Platform.OS === 'ios';

  const leading: HeaderAction | undefined =
    leftAction ??
    (onBack ? { icon: 'back', accessibilityLabel: backLabel ?? t('common.back'), onPress: onBack } : undefined);

  const titleBlock =
    title || subtitle ? (
      <View
        style={[
          styles.titleBlock,
          centered ? styles.titleCentered : [styles.titleLeading, { paddingHorizontal: spacing.sm }],
        ]}
      >
        {title ? (
          <AppText variant="subtitle" numberOfLines={1} accessibilityRole="header" align={centered ? 'center' : 'left'}>
            {title}
          </AppText>
        ) : null}
        {subtitle ? (
          <AppText variant="caption" color="textSecondary" numberOfLines={1} align={centered ? 'center' : 'left'}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
    ) : (
      <View style={[styles.titleLeading, { paddingHorizontal: spacing.sm }]} />
    );

  const renderAction = (action: HeaderAction) => (
    <AppIconButton
      key={`${action.icon}-${action.accessibilityLabel}`}
      icon={action.icon}
      accessibilityLabel={action.accessibilityLabel}
      onPress={action.onPress}
    />
  );

  return (
    <View
      style={[
        {
          paddingTop: withSafeArea ? insets.top : 0,
          backgroundColor: transparent ? 'transparent' : colors.background,
          borderBottomColor: colors.border,
          borderBottomWidth: bordered ? sizes.hairline : 0,
        },
        style,
      ]}
    >
      <View style={[styles.row, { minHeight: sizes.header, paddingHorizontal: spacing.xs, gap: spacing.xs }]}>
        <View style={[styles.side, centered ? styles.sideFill : null]}>{leading ? renderAction(leading) : null}</View>
        {titleBlock}
        <View style={[styles.side, styles.sideTrailing, centered ? styles.sideFill : null]}>
          {rightActions.map(renderAction)}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  side: { flexDirection: 'row', alignItems: 'center' },
  // Equal-width sides keep the iOS title optically centred regardless of action count.
  sideFill: { flex: 1, flexBasis: 0 },
  sideTrailing: { justifyContent: 'flex-end' },
  titleBlock: { justifyContent: 'center' },
  titleCentered: { flexShrink: 1, maxWidth: '60%' },
  titleLeading: { flex: 1 },
});
