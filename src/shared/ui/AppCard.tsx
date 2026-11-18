import { Image, type ImageSource } from 'expo-image';
import { type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { type SpacingToken } from '@/core/theme/tokens';

export type CardVariant = 'elevated' | 'outlined' | 'filled';

export interface AppCardProps {
  readonly children?: ReactNode;
  readonly variant?: CardVariant;
  /** Inner padding around `children`. The image is always full-bleed. */
  readonly padding?: SpacingToken;
  /** Full-bleed photo at the top of the card (for example a destination). */
  readonly image?: ImageSource | string;
  readonly imageAspectRatio?: number;
  /** Describes the photo for screen readers. Omit for purely decorative images. */
  readonly imageAlt?: string;
  /** Makes the whole card a single button. */
  readonly onPress?: () => void;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/**
 * Rounded content container. The shadow sits on an outer view and clipping on
 * an inner one, because `overflow: hidden` would clip the shadow on iOS.
 */
export function AppCard({
  children,
  variant = 'elevated',
  padding = 'lg',
  image,
  imageAspectRatio = 16 / 10,
  imageAlt,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: AppCardProps) {
  const { colors, radii, spacing, shadows, sizes } = useAppTheme();
  const radius = radii.lg;

  const content = (
    <>
      {image !== undefined ? (
        <Image
          source={image}
          contentFit="cover"
          transition={200}
          accessible={imageAlt !== undefined}
          accessibilityLabel={imageAlt}
          style={[styles.image, { aspectRatio: imageAspectRatio, backgroundColor: colors.surfaceMuted }]}
        />
      ) : null}
      {children !== undefined ? <View style={{ padding: spacing[padding], gap: spacing.sm }}>{children}</View> : null}
    </>
  );

  const surface: ViewStyle = {
    borderRadius: radius,
    backgroundColor: variant === 'filled' ? colors.surfaceMuted : colors.surface,
    borderWidth: variant === 'filled' ? 0 : sizes.hairline,
    borderColor: variant === 'outlined' ? colors.borderStrong : colors.border,
  };

  return (
    <View style={[{ borderRadius: radius }, variant === 'elevated' ? shadows.md : null, style]} testID={testID}>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          onPress={onPress}
          android_ripple={Platform.OS === 'android' ? { color: colors.surfacePressed, foreground: true } : undefined}
          style={({ pressed }) => [
            styles.clip,
            surface,
            pressed && Platform.OS !== 'android' ? styles.pressedIOS : null,
          ]}
        >
          {content}
        </Pressable>
      ) : (
        <View style={[styles.clip, surface]} accessibilityLabel={accessibilityLabel}>
          {content}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  image: { width: '100%' },
  pressedIOS: { opacity: 0.85 },
});
