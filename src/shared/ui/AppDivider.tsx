import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { type SpacingToken } from '@/core/theme/tokens';

export interface AppDividerProps {
  readonly orientation?: 'horizontal' | 'vertical';
  /** Leading inset, e.g. to align with list-item text after an icon. */
  readonly inset?: SpacingToken;
  /** Space on both sides of the line, along the cross axis. */
  readonly spacing?: SpacingToken;
  readonly strong?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

/** Hairline separator. Hidden from screen readers. */
export function AppDivider({
  orientation = 'horizontal',
  inset = 'none',
  spacing = 'none',
  strong = false,
  style,
}: AppDividerProps) {
  const theme = useAppTheme();
  const color = strong ? theme.colors.borderStrong : theme.colors.border;
  const gap = theme.spacing[spacing];

  const line: ViewStyle =
    orientation === 'horizontal'
      ? { height: theme.sizes.hairline, marginStart: theme.spacing[inset], marginVertical: gap, alignSelf: 'stretch' }
      : { width: theme.sizes.hairline, marginTop: theme.spacing[inset], marginHorizontal: gap, alignSelf: 'stretch' };

  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[line, { backgroundColor: color }, style]}
    />
  );
}
