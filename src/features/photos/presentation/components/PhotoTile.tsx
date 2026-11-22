import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppBadge, AppIcon, AppText } from '@/shared/ui';

import { formatPhotoDate } from '../format';
import { type PhotoItem } from '../hooks/usePhotos';

interface PhotoTileProps {
  readonly item: PhotoItem;
  /** Labels activity photos with their activity (the trip gallery). */
  readonly showActivity: boolean;
  readonly onPress: () => void;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * A square thumbnail. A photo whose file is missing, invalid or unreadable shows a
 * placeholder instead, and can still be opened (and deleted).
 */
export function PhotoTile({ item, showActivity, onPress, style }: PhotoTileProps) {
  const { t, i18n } = useTranslation();
  const { colors, radii, spacing } = useAppTheme();
  const { photo, displayUri, activityTitle } = item;
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showImage = displayUri !== null && failedUri !== displayUri;
  const date = formatPhotoDate(photo.createdAt, i18n.language);
  const label = !showImage
    ? t('photos.tileUnavailableLabel', { date })
    : activityTitle
      ? t('photos.tileActivityLabel', { activity: activityTitle, date })
      : t('photos.tileLabel', { date });

  return (
    <Pressable
      testID={`photo-tile-${photo.id}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      android_ripple={Platform.OS === 'android' ? { color: colors.surfacePressed, foreground: true } : undefined}
      style={({ pressed }) => [
        styles.tile,
        { borderRadius: radii.md, backgroundColor: colors.surfaceMuted },
        pressed && Platform.OS !== 'android' ? styles.pressed : null,
        style,
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: displayUri }}
          recyclingKey={displayUri}
          contentFit="cover"
          transition={150}
          onError={() => setFailedUri(displayUri)}
          style={StyleSheet.absoluteFill}
          accessible={false}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.center, { padding: spacing.xs, gap: spacing.xxs }]}>
          <AppIcon name="image" size="md" color="textTertiary" />
          <AppText variant="caption" color="textSecondary" align="center" numberOfLines={2}>
            {t('photos.unavailable')}
          </AppText>
        </View>
      )}
      {showActivity && activityTitle ? (
        <View style={[styles.badge, { start: spacing.xs, end: spacing.xs, bottom: spacing.xs }]}>
          <AppBadge label={activityTitle} variant="solid" size="sm" style={styles.badgeLabel} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { aspectRatio: 1, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', alignItems: 'flex-start' },
  badgeLabel: { maxWidth: '100%' },
  pressed: { opacity: 0.85 },
});
