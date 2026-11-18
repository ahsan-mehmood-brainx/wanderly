import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppIcon } from '@/shared/ui';

const SIZE = 64;

/** Wanderly's mark on auth screens: the brand colour with a travel glyph. Decorative. */
export function BrandMark() {
  const { colors, radii, shadows } = useAppTheme();

  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.mark, { backgroundColor: colors.primary, borderRadius: radii.lg }, shadows.sm]}
    >
      <AppIcon name="flight" size="xl" color="onPrimary" />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
});
