import { SymbolView } from 'expo-symbols';
import { type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { type IconSize } from '@/core/theme/tokens';
import { type ThemeColors } from '@/core/theme/types';

import { icons, type AppIconName } from './icons';

export interface AppIconProps {
  readonly name: AppIconName;
  /** A size token or an explicit point size. */
  readonly size?: IconSize | number;
  readonly color?: keyof ThemeColors;
  /**
   * Icons are decorative by default (hidden from screen readers). Pass a label
   * only when the icon conveys meaning on its own.
   */
  readonly accessibilityLabel?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/** Native platform icon: SF Symbols on iOS, Material Symbols on Android and web. */
export function AppIcon({ name, size = 'lg', color = 'text', accessibilityLabel, style, testID }: AppIconProps) {
  const theme = useAppTheme();
  const points = typeof size === 'number' ? size : theme.sizes.icon[size];
  const decorative = accessibilityLabel === undefined;

  return (
    <SymbolView
      name={icons[name]}
      size={points}
      tintColor={theme.colors[color]}
      resizeMode="scaleAspectFit"
      style={[{ width: points, height: points }, style]}
      testID={testID}
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
      accessibilityElementsHidden={decorative}
    />
  );
}
