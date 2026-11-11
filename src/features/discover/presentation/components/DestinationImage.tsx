import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppIcon, AppText, type AppIconName } from '@/shared/ui';

import { type DestinationCategory, type DestinationKind } from '../../domain/Destination';
import { CATEGORY_ICONS } from '../categoryIcons';

export interface DestinationImageProps {
  readonly uri: string | null;
  readonly kind: DestinationKind;
  readonly categories?: readonly DestinationCategory[];
  /** Shown large in the placeholder for countries without a flag image. */
  readonly flagEmoji?: string | null;
  /** Describes the image; omit for decorative thumbnails next to a visible name. */
  readonly accessibilityLabel?: string;
  /** `contain` for flags (never crop a flag), `cover` for photos. */
  readonly contentFit?: 'cover' | 'contain';
  readonly style?: StyleProp<ViewStyle>;
}

function placeholderIcon(kind: DestinationKind, categories: readonly DestinationCategory[]): AppIconName {
  if (kind === 'country') return 'flag';
  const [first] = categories;
  return first ? CATEGORY_ICONS[first] : kind === 'city' ? 'city' : 'location';
}

/**
 * Photo or flag with a themed placeholder. Many places have no image, and
 * remote images can fail (404, offline, blocked), so the placeholder is shown
 * both when there is no URL and when loading fails.
 */
export function DestinationImage({
  uri,
  kind,
  categories = [],
  flagEmoji,
  accessibilityLabel,
  contentFit = 'cover',
  style,
}: DestinationImageProps) {
  const { colors } = useAppTheme();
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showImage = uri !== null && failedUri !== uri;

  return (
    <View
      style={[styles.frame, { backgroundColor: colors.surfaceMuted }, style]}
      accessible={accessibilityLabel !== undefined}
      accessibilityRole={accessibilityLabel !== undefined ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      {showImage ? (
        <Image
          source={{ uri }}
          recyclingKey={uri}
          contentFit={contentFit}
          transition={150}
          onError={() => setFailedUri(uri)}
          style={StyleSheet.absoluteFill}
          accessible={false}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.center]} testID="destination-image-placeholder">
          {kind === 'country' && flagEmoji ? (
            <AppText style={styles.emoji} importantForAccessibility="no" accessibilityElementsHidden>
              {flagEmoji}
            </AppText>
          ) : (
            <AppIcon name={placeholderIcon(kind, categories)} size="xl" color="textTertiary" />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 32, lineHeight: 40 },
});
