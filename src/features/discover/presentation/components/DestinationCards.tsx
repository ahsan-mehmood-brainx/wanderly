import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppIcon, AppText } from '@/shared/ui';

import { type DestinationSummary } from '../../domain/Destination';
import { destinationSubtitle } from '../format';
import { DestinationImage } from './DestinationImage';

interface CardProps {
  readonly destination: DestinationSummary;
  readonly onPress: () => void;
}

const FEATURE_WIDTH = 240;
const TILE_WIDTH = 132;

/** Large photo card for featured destinations. */
export function FeaturedDestinationCard({ destination, onPress }: CardProps) {
  const { t } = useTranslation();
  const { colors, spacing, radii, shadows } = useAppTheme();
  const subtitle = destinationSubtitle(destination, t);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${destination.name}, ${subtitle}`}
      onPress={onPress}
      android_ripple={Platform.OS === 'android' ? { color: colors.surfacePressed, foreground: true } : undefined}
      style={({ pressed }) => [
        styles.feature,
        shadows.md,
        { borderRadius: radii.lg, backgroundColor: colors.surface },
        pressed && Platform.OS !== 'android' ? styles.pressed : null,
      ]}
    >
      <DestinationImage
        uri={destination.imageUrl}
        kind={destination.kind}
        categories={destination.categories}
        style={[styles.featureImage, { borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg }]}
      />
      <View style={{ padding: spacing.md, gap: spacing.xxs }}>
        <AppText variant="headline" numberOfLines={1}>
          {destination.name}
        </AppText>
        <AppText variant="caption" color="textSecondary" numberOfLines={1}>
          {destination.flagEmoji ? `${destination.flagEmoji} ` : ''}
          {subtitle}
        </AppText>
      </View>
    </Pressable>
  );
}

/** Compact flag tile for countries. */
export function CountryTile({ destination, onPress }: CardProps) {
  const { t } = useTranslation();
  const { colors, spacing, radii, sizes } = useAppTheme();
  const subtitle = destinationSubtitle(destination, t);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${destination.name}, ${subtitle}`}
      onPress={onPress}
      android_ripple={Platform.OS === 'android' ? { color: colors.surfacePressed, foreground: true } : undefined}
      style={({ pressed }) => [
        styles.tile,
        {
          borderRadius: radii.md,
          borderWidth: sizes.hairline,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: spacing.sm,
          gap: spacing.sm,
        },
        pressed && Platform.OS !== 'android' ? styles.pressed : null,
      ]}
    >
      <DestinationImage
        uri={destination.imageUrl}
        kind="country"
        flagEmoji={destination.flagEmoji}
        contentFit="contain"
        style={[styles.tileFlag, { borderRadius: radii.sm }]}
      />
      <View style={{ gap: spacing.xxs }}>
        <AppText variant="label" numberOfLines={1}>
          {destination.name}
        </AppText>
        <AppText variant="caption" color="textSecondary" numberOfLines={1}>
          {subtitle}
        </AppText>
      </View>
    </Pressable>
  );
}

interface DestinationRowProps extends CardProps {
  /** Replaces the default subtitle (e.g. a recommendation reason). */
  readonly subtitle?: string;
  readonly testID?: string;
}

/** List row for search results, trending, recent and recommended destinations. */
export function DestinationRow({ destination, onPress, subtitle, testID }: DestinationRowProps) {
  const { t } = useTranslation();
  const { colors, spacing, radii } = useAppTheme();
  const text = subtitle ?? destinationSubtitle(destination, t);

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${destination.name}, ${text}`}
      onPress={onPress}
      android_ripple={Platform.OS === 'android' ? { color: colors.surfacePressed } : undefined}
      style={({ pressed }) => [
        styles.row,
        { gap: spacing.md, paddingVertical: spacing.sm },
        pressed && Platform.OS !== 'android' ? styles.pressed : null,
      ]}
    >
      <DestinationImage
        uri={destination.imageUrl}
        kind={destination.kind}
        categories={destination.categories}
        flagEmoji={destination.flagEmoji}
        contentFit={destination.kind === 'country' ? 'contain' : 'cover'}
        style={[styles.thumb, { borderRadius: radii.sm }]}
      />
      <View style={styles.rowText}>
        <AppText variant="headline" numberOfLines={1}>
          {destination.name}
        </AppText>
        <AppText variant="caption" color="textSecondary" numberOfLines={2}>
          {text}
        </AppText>
      </View>
      <AppIcon name="chevronRight" size="sm" color="textTertiary" />
    </Pressable>
  );
}

const THUMB_SIZE = 56;

const styles = StyleSheet.create({
  feature: { width: FEATURE_WIDTH },
  featureImage: { width: '100%', aspectRatio: 4 / 3 },
  tile: { width: TILE_WIDTH, overflow: 'hidden' },
  tileFlag: { width: '100%', aspectRatio: 3 / 2 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  rowText: { flex: 1, gap: 2 },
  thumb: { width: THUMB_SIZE, height: THUMB_SIZE },
  pressed: { opacity: 0.85 },
});
