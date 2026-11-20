import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';

import { getErrorMessageKey } from '@/core/errors/errorMessages';
import { useAppDispatch, useAppSelector } from '@/core/store/hooks';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { ConfirmSheet } from '@/features/trips/presentation/components/ConfirmSheet';
import { routes } from '@/shared/navigation/routes';
import { AppButton, AppEmptyView, AppErrorView, AppIconButton, AppLoader, AppText, InlineMessage } from '@/shared/ui';

import { type Favorite } from '../../domain/Favorite';
import { CollectionNameSheet } from '../components/CollectionNameSheet';
import { SavedPlaceActionsSheet } from '../components/SavedPlaceActionsSheet';
import { SavedPlaceRow, SavedPlaceSeparator } from '../components/SavedPlaceRow';
import { collectionName, opensDestination } from '../format';
import { useCollection } from '../hooks/useCollection';
import { deleteCollection, removeFromCollection } from '../state/favoritesSlice';
import { selectFavoriteById, selectFavoritesSaving } from '../state/selectors';

interface CollectionDetailsScreenProps {
  /** Already validated by the route (shape). */
  readonly collectionId: string;
}

const backToSavedPlaces = () => {
  if (router.canGoBack()) router.back();
  else router.replace(routes.savedPlaces);
};

/** The places in one collection, with Rename and Delete for custom collections. */
export function CollectionDetailsScreen({ collectionId }: CollectionDetailsScreenProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useAppTheme();
  const dispatch = useAppDispatch();
  const { status, errorKind, retry, collection, favorites } = useCollection(collectionId);
  const saving = useAppSelector(selectFavoritesSaving);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = useAppSelector((state) => (activeId === null ? undefined : selectFavoriteById(state, activeId)));
  const [sheet, setSheet] = useState<'rename' | 'delete' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Set while this screen deletes its collection: the store drops it before the
  // screen goes back, which must not show "Collection not found" meanwhile.
  const [deleting, setDeleting] = useState(false);

  if (status === 'failed') return <AppErrorView fullScreen errorKind={errorKind ?? undefined} onRetry={retry} />;
  if (status !== 'ready' || (deleting && !collection)) return <AppLoader fullScreen />;
  if (!collection) {
    return (
      <AppEmptyView
        fullScreen
        icon="bookmark"
        title={t('savedPlaces.collection.notFoundTitle')}
        message={t('savedPlaces.collection.notFoundMessage')}
        actionLabel={t('savedPlaces.collection.backToSaved')}
        onAction={backToSavedPlaces}
        testID="collection-not-found"
      />
    );
  }

  const name = collectionName(collection, t);
  const custom = collection.kind === 'custom';

  const openFavorite = (favorite: Favorite) => {
    if (opensDestination(favorite)) router.push(routes.destination(favorite.targetId));
    else setActiveId(favorite.id);
  };

  const removeFromThisCollection = async (favorite: Favorite) => {
    setErrorMessage(null);
    const action = await dispatch(removeFromCollection({ collectionId, favoriteId: favorite.id }));
    if (removeFromCollection.fulfilled.match(action) && action.payload.status === 'failed') {
      setErrorMessage(t(getErrorMessageKey(action.payload.errorKind)));
    }
  };

  const confirmDelete = async () => {
    setSheet(null);
    setErrorMessage(null);
    setDeleting(true);
    const action = await dispatch(deleteCollection(collectionId));
    const outcome = deleteCollection.fulfilled.match(action) ? action.payload : null;
    if (outcome?.status === 'deleted') {
      backToSavedPlaces();
      return;
    }
    setDeleting(false);
    if (outcome?.status === 'failed') setErrorMessage(t(getErrorMessageKey(outcome.errorKind)));
  };

  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.lg }}>
      <View style={{ gap: spacing.xxs }}>
        <AppText variant="largeTitle" accessibilityRole="header">
          {name}
        </AppText>
        <AppText color="textSecondary">{t('savedPlaces.placeCount', { count: favorites.length })}</AppText>
      </View>
      {custom ? (
        <View style={[styles.actions, { gap: spacing.sm }]}>
          <AppButton
            label={t('savedPlaces.collection.rename')}
            variant="outline"
            size="sm"
            leftIcon="edit"
            disabled={saving}
            onPress={() => setSheet('rename')}
          />
          <AppButton
            label={t('savedPlaces.collection.delete')}
            variant="ghost"
            size="sm"
            leftIcon="trash"
            disabled={saving}
            onPress={() => setSheet('delete')}
          />
        </View>
      ) : null}
      {errorMessage ? <InlineMessage tone="danger" icon="error" message={errorMessage} /> : null}
    </View>
  );

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]} testID="collection-details">
      <FlatList
        data={favorites}
        keyExtractor={(item) => item.id}
        style={styles.fill}
        contentContainerStyle={{ padding: spacing.lg }}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={header}
        ItemSeparatorComponent={SavedPlaceSeparator}
        renderItem={({ item }) => (
          <SavedPlaceRow
            favorite={item}
            onOpen={() => openFavorite(item)}
            trailing={
              <AppIconButton
                icon="close"
                accessibilityLabel={t('savedPlaces.collection.removeFromCollection', { name: item.name })}
                disabled={saving}
                onPress={() => void removeFromThisCollection(item)}
              />
            }
          />
        )}
        ListEmptyComponent={
          <AppEmptyView
            icon="bookmark"
            title={t('savedPlaces.collection.emptyTitle')}
            message={t('savedPlaces.collection.emptyMessage')}
            testID="collection-empty"
          />
        }
      />
      <SavedPlaceActionsSheet favorite={active ?? null} onClose={() => setActiveId(null)} />
      {custom ? (
        <>
          <CollectionNameSheet visible={sheet === 'rename'} collection={collection} onClose={() => setSheet(null)} />
          <ConfirmSheet
            visible={sheet === 'delete'}
            title={t('savedPlaces.collection.deleteTitle')}
            message={t('savedPlaces.collection.deleteMessage', { name })}
            confirmLabel={t('savedPlaces.collection.deleteConfirm')}
            cancelLabel={t('savedPlaces.collection.keep')}
            onConfirm={() => void confirmDelete()}
            onCancel={() => setSheet(null)}
            testID="delete-collection-confirm"
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap' },
});
