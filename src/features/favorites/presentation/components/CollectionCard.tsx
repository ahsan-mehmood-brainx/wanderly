import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppIcon, AppText } from '@/shared/ui';

import { type Collection } from '../../domain/Collection';
import { collectionName } from '../format';

const CARD_WIDTH = 152;

interface CollectionCardProps {
  readonly collection: Collection;
  readonly count: number;
  readonly onPress: () => void;
}

/** A collection in the Saved Places row: its name and how many places it holds. */
export function CollectionCard({ collection, count, onPress }: CollectionCardProps) {
  const { t } = useTranslation();
  const { colors, spacing, radii, sizes } = useAppTheme();
  const name = collectionName(collection, t);
  const places = t('savedPlaces.placeCount', { count });

  return (
    <Pressable
      testID={`collection-card-${collection.id}`}
      accessibilityRole="button"
      accessibilityLabel={t('savedPlaces.collectionCardLabel', { name, count: places })}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          gap: spacing.xs,
          padding: spacing.md,
          borderRadius: radii.lg,
          borderWidth: sizes.hairline,
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surfacePressed : colors.surface,
        },
      ]}
    >
      <AppIcon name={collection.kind === 'default' ? 'bookmark' : 'favorite'} size="md" color="primary" />
      <AppText variant="headline" numberOfLines={2}>
        {name}
      </AppText>
      <AppText variant="caption" color="textSecondary">
        {places}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: CARD_WIDTH },
});
