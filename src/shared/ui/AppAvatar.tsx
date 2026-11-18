import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { type AvatarSize } from '@/core/theme/tokens';

import { AppIcon } from './AppIcon';
import { AppText } from './AppText';
import { getInitials } from './getInitials';

export interface AppAvatarProps {
  /** Used for initials when there is no photo, and as the accessibility label. */
  readonly name?: string;
  readonly imageUri?: string;
  readonly size?: AvatarSize;
  readonly accessibilityLabel?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/** Circular photo that falls back to initials, then to a person icon, if the image is missing or fails. */
export function AppAvatar({ name, imageUri, size = 'md', accessibilityLabel, style, testID }: AppAvatarProps) {
  const { colors, sizes } = useAppTheme();
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const dimension = sizes.avatar[size];
  const initials = name ? getInitials(name) : '';
  const showImage = imageUri !== undefined && imageUri !== failedUri;
  const label = accessibilityLabel ?? name;

  return (
    <View
      testID={testID}
      accessible={label !== undefined}
      accessibilityRole={label !== undefined ? 'image' : undefined}
      accessibilityLabel={label}
      style={[
        styles.base,
        { width: dimension, height: dimension, borderRadius: dimension / 2, backgroundColor: colors.primaryMuted },
        style,
      ]}
    >
      {showImage ? (
        <Image
          source={imageUri}
          contentFit="cover"
          transition={150}
          accessible={false}
          onError={() => setFailedUri(imageUri)}
          style={StyleSheet.absoluteFill}
        />
      ) : initials ? (
        <AppText
          color="primary"
          allowFontScaling={false}
          style={{ fontSize: dimension * 0.4, lineHeight: dimension * 0.5, fontWeight: '600' }}
        >
          {initials}
        </AppText>
      ) : (
        <AppIcon name="person" size={dimension * 0.55} color="primary" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
