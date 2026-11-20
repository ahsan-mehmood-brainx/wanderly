import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { getErrorMessageKey } from '@/core/errors/errorMessages';
import { useAppDispatch, useAppSelector } from '@/core/store/hooks';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppBottomSheet, AppButton, AppIcon, AppText, InlineMessage } from '@/shared/ui';

import { type Favorite } from '../../domain/Favorite';
import { collectionName } from '../format';
import { setFavoriteCollections } from '../state/favoritesSlice';
import { selectCollectionsWithCounts, selectFavoriteCollectionIds, selectFavoritesSaving } from '../state/selectors';

interface CollectionPickerSheetProps {
  readonly visible: boolean;
  readonly favorite: Favorite | null;
  readonly onClose: () => void;
}

const NO_IDS: readonly string[] = [];

/** Ticks the collections a saved place belongs to; Save makes them exactly the ticked ones. */
export function CollectionPickerSheet({ visible, favorite, onClose }: CollectionPickerSheetProps) {
  const { t } = useTranslation();
  const { spacing, sizes } = useAppTheme();
  const dispatch = useAppDispatch();
  const collections = useAppSelector(selectCollectionsWithCounts);
  const current = useAppSelector((state) => (favorite ? selectFavoriteCollectionIds(state, favorite.id) : NO_IDS));
  const saving = useAppSelector(selectFavoritesSaving);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Start from the place's current collections each time the sheet opens.
  const [wasVisible, setWasVisible] = useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setChecked(new Set(current));
      setErrorMessage(null);
    }
  }

  const toggle = (id: string) =>
    setChecked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    if (!favorite) return;
    setErrorMessage(null);
    const action = await dispatch(setFavoriteCollections({ favoriteId: favorite.id, collectionIds: [...checked] }));
    if (!setFavoriteCollections.fulfilled.match(action)) return;
    if (action.payload.status === 'saved') onClose();
    else setErrorMessage(t(getErrorMessageKey(action.payload.errorKind)));
  };

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      title={t('savedPlaces.picker.title')}
      testID="collection-picker"
    >
      <View style={[styles.content, { gap: spacing.lg }]}>
        <ScrollView style={styles.list} contentContainerStyle={{ gap: spacing.xxs }}>
          {collections.map(({ collection }) => {
            const name = collectionName(collection, t);
            const isChecked = checked.has(collection.id);
            return (
              <Pressable
                key={collection.id}
                accessibilityRole="checkbox"
                accessibilityLabel={name}
                accessibilityState={{ checked: isChecked }}
                onPress={() => toggle(collection.id)}
                style={[styles.option, { gap: spacing.md, minHeight: sizes.touchTarget }]}
              >
                <AppIcon
                  name={isChecked ? 'checkCircle' : 'circle'}
                  size="lg"
                  color={isChecked ? 'primary' : 'textTertiary'}
                />
                <AppText style={styles.label} numberOfLines={2}>
                  {name}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>
        {errorMessage ? <InlineMessage tone="danger" icon="error" message={errorMessage} /> : null}
        <AppButton
          label={t('savedPlaces.picker.save')}
          fullWidth
          loading={saving}
          disabled={saving || !favorite}
          onPress={() => void save()}
        />
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { flexShrink: 1 },
  list: { flexGrow: 0 },
  option: { flexDirection: 'row', alignItems: 'center' },
  label: { flex: 1 },
});
