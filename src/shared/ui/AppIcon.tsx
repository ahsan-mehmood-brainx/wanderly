import { SymbolView } from 'expo-symbols';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';

import { useLayoutDirection } from '@/core/i18n/LayoutDirectionProvider';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { type IconSize } from '@/core/theme/tokens';
import { type ThemeColors } from '@/core/theme/types';

import { DIRECTIONAL_ICONS, IOS_SELF_MIRRORING_ICONS, icons, type AppIconName } from './icons';

const MIRRORED: ViewStyle = { transform: [{ scaleX: -1 }] };

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
  const { isRTL } = useLayoutDirection();
  const points = typeof size === 'number' ? size : theme.sizes.icon[size];
  const decorative = accessibilityLabel === undefined;
  // A self-mirroring SF Symbol flips itself in an RTL view. On Fabric each view's
  // semantic direction comes from its Yoga layout direction, which follows the JS
  // `direction` set at the root (not `I18nManager.isRTL`, which only changes on
  // restart), so such a symbol is already the right way round and is never
  // mirrored in JS on iOS.
  const nativeMirrored = Platform.OS === 'ios' && IOS_SELF_MIRRORING_ICONS.has(name);
  const mirrored = DIRECTIONAL_ICONS.has(name) && isRTL && !nativeMirrored;

  return (
    <SymbolView
      name={icons[name]}
      size={points}
      tintColor={theme.colors[color]}
      resizeMode="scaleAspectFit"
      style={[{ width: points, height: points }, mirrored ? MIRRORED : null, style]}
      testID={testID}
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
      accessibilityElementsHidden={decorative}
    />
  );
}
