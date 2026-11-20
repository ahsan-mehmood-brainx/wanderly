import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { DestinationImage } from '@/features/discover/presentation/components/DestinationImage';
import { AppBadge, AppIcon, AppText } from '@/shared/ui';

import { type Favorite } from '../../domain/Favorite';
import { FAVORITE_CATEGORY_ICONS, opensDestination } from '../format';

const THUMBNAIL_SIZE = 56;

interface SavedPlaceRowProps {
  readonly favorite: Favorite;
  readonly onOpen: () => void;
  /** Rendered at the trailing edge, e.g. a "more" or "remove" button. */
  readonly trailing?: ReactNode;
}

/** One saved place: thumbnail (photo, flag or category icon), name, subtitle and category. */
export function SavedPlaceRow({ favorite, onOpen, trailing }: SavedPlaceRowProps) {
  const { t } = useTranslation();
  const { colors, spacing, radii, sizes } = useAppTheme();
  const category = t(`savedPlaces.categories.${favorite.category}`);
  const isDestination = opensDestination(favorite);

  return (
    <View
      testID={`saved-place-${favorite.id}`}
      style={[
        styles.row,
        {
          gap: spacing.sm,
          padding: spacing.sm,
          borderRadius: radii.lg,
          borderWidth: sizes.hairline,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[t('savedPlaces.rowLabel', { name: favorite.name, category }), favorite.subtitle]
          .filter(Boolean)
          .join(', ')}
        onPress={onOpen}
        style={({ pressed }) => [styles.body, { gap: spacing.md }, pressed ? styles.pressed : null]}
      >
        {isDestination ? (
          <DestinationImage
            uri={favorite.imageUrl}
            kind={favorite.category === 'country' ? 'country' : 'city'}
            flagEmoji={favorite.flagEmoji}
            contentFit={favorite.category === 'country' ? 'contain' : 'cover'}
            style={[styles.thumbnail, { borderRadius: radii.md }]}
          />
        ) : (
          <View
            style={[styles.thumbnail, styles.center, { borderRadius: radii.md, backgroundColor: colors.surfaceMuted }]}
          >
            <AppIcon name={FAVORITE_CATEGORY_ICONS[favorite.category]} size="lg" color="textTertiary" />
          </View>
        )}
        <View style={[styles.text, { gap: spacing.xxs }]}>
          <AppText variant="headline" numberOfLines={2}>
            {favorite.name}
          </AppText>
          {favorite.subtitle ? (
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              {favorite.subtitle}
            </AppText>
          ) : null}
          <AppBadge label={category} icon={FAVORITE_CATEGORY_ICONS[favorite.category]} size="sm" />
        </View>
      </Pressable>
      {trailing}
    </View>
  );
}

/** Space between rows in a list of saved places. */
export function SavedPlaceSeparator() {
  const { spacing } = useAppTheme();
  return <View style={{ height: spacing.sm }} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  pressed: { opacity: 0.7 },
  thumbnail: { width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE },
  center: { alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, alignItems: 'flex-start' },
});
