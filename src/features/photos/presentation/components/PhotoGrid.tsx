import { type ReactElement } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { useLayoutDirection } from '@/core/i18n/LayoutDirectionProvider';
import { useAppTheme } from '@/core/theme/ThemeProvider';

import { type Photo } from '../../domain/Photo';
import { type PhotoItem } from '../hooks/usePhotos';
import { PhotoTile } from './PhotoTile';

const COLUMNS = 3;

interface PhotoGridProps {
  readonly items: readonly PhotoItem[];
  readonly showActivity: boolean;
  readonly onOpen: (photo: Photo) => void;
  readonly header?: ReactElement;
  readonly empty?: ReactElement;
  readonly testID?: string;
}

/** A virtualised three-column gallery (a trip can hold up to 200 photos) that fills the screen. */
export function PhotoGrid({ items, showActivity, onOpen, header, empty, testID }: PhotoGridProps) {
  const { colors, spacing } = useAppTheme();
  const { direction } = useLayoutDirection();
  const gap = spacing.xxs;

  return (
    <FlatList
      testID={testID}
      data={items}
      keyExtractor={(item) => item.photo.id}
      numColumns={COLUMNS}
      contentInsetAdjustmentBehavior="automatic"
      style={[styles.fill, { backgroundColor: colors.background, direction }]}
      contentContainerStyle={{ padding: spacing.lg - gap, direction }}
      ListHeaderComponent={
        header ? <View style={{ padding: gap, paddingBottom: spacing.lg }}>{header}</View> : undefined
      }
      ListEmptyComponent={empty}
      renderItem={({ item }) => (
        <View style={[styles.cell, { padding: gap }]}>
          <PhotoTile item={item} showActivity={showActivity} onPress={() => onOpen(item.photo)} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  cell: { width: `${100 / COLUMNS}%` },
});
