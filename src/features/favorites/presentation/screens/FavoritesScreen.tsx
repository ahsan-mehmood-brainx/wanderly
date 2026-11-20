import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';

import { useAppSelector } from '@/core/store/hooks';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { HorizontalList, Section } from '@/features/discover/presentation/components/Section';
import { routes } from '@/shared/navigation/routes';
import { AppChip, AppEmptyView, AppErrorView, AppIconButton, AppInput, AppLoader, AppText } from '@/shared/ui';

import { type Favorite, FAVORITE_CATEGORIES } from '../../domain/Favorite';
import { type FavoriteCategoryFilter } from '../../domain/favoriteSearch';
import { CollectionCard } from '../components/CollectionCard';
import { CollectionNameSheet } from '../components/CollectionNameSheet';
import { SavedPlaceActionsSheet } from '../components/SavedPlaceActionsSheet';
import { SavedPlaceRow, SavedPlaceSeparator } from '../components/SavedPlaceRow';
import { opensDestination } from '../format';
import { useFavorites } from '../hooks/useFavorites';
import { selectFavoriteById } from '../state/selectors';

const FILTERS: readonly FavoriteCategoryFilter[] = ['all', ...FAVORITE_CATEGORIES];

/** Saved Places: collections, then every saved place with search and a category filter. Works offline. */
export function FavoritesScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useAppTheme();
  const {
    status,
    errorKind,
    retry,
    total,
    favorites,
    collections,
    query,
    setQuery,
    category,
    setCategory,
    clearFilter,
  } = useFavorites();
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = useAppSelector((state) => (activeId === null ? undefined : selectFavoriteById(state, activeId)));
  const [creating, setCreating] = useState(false);

  if (status === 'failed') return <AppErrorView fullScreen errorKind={errorKind ?? undefined} onRetry={retry} />;
  if (status !== 'ready') return <AppLoader fullScreen />;

  const openFavorite = (favorite: Favorite) => {
    if (opensDestination(favorite)) router.push(routes.destination(favorite.targetId));
    else setActiveId(favorite.id);
  };

  const header = (
    <View style={{ gap: spacing.xl, paddingBottom: spacing.md }}>
      <Section
        title={t('savedPlaces.collectionsTitle')}
        action={{ label: t('savedPlaces.newCollection'), onPress: () => setCreating(true) }}
      >
        <HorizontalList>
          {collections.map(({ collection, count }) => (
            <CollectionCard
              key={collection.id}
              collection={collection}
              count={count}
              onPress={() => router.push(routes.collection(collection.id))}
            />
          ))}
        </HorizontalList>
      </Section>

      {total > 0 ? (
        <View style={{ gap: spacing.md }}>
          <AppText variant="subtitle" accessibilityRole="header">
            {t('savedPlaces.placesTitle')}
          </AppText>
          <AppInput
            accessibilityLabel={t('savedPlaces.searchLabel')}
            placeholder={t('savedPlaces.searchPlaceholder')}
            leftIcon="search"
            clearable
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            returnKeyType="search"
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -spacing.lg }}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
          >
            {FILTERS.map((filter) => (
              <AppChip
                key={filter}
                label={t(`savedPlaces.filters.${filter}`)}
                selected={category === filter}
                onPress={() => setCategory(filter)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );

  return (
    <>
      <FlatList
        data={favorites}
        keyExtractor={(item) => item.id}
        style={[styles.fill, { backgroundColor: colors.background }]}
        contentContainerStyle={{ padding: spacing.lg }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        ItemSeparatorComponent={SavedPlaceSeparator}
        renderItem={({ item }) => (
          <SavedPlaceRow
            favorite={item}
            onOpen={() => openFavorite(item)}
            trailing={
              <AppIconButton
                icon="more"
                accessibilityLabel={t('savedPlaces.more', { name: item.name })}
                onPress={() => setActiveId(item.id)}
              />
            }
          />
        )}
        ListEmptyComponent={
          total === 0 ? (
            <AppEmptyView
              icon="bookmark"
              title={t('savedPlaces.emptyTitle')}
              message={t('savedPlaces.emptyMessage')}
              actionLabel={t('savedPlaces.explore')}
              onAction={() => router.push(routes.explore)}
              testID="favorites-empty"
            />
          ) : (
            <AppEmptyView
              icon="search"
              title={t('savedPlaces.noResultsTitle')}
              message={t('savedPlaces.noResultsMessage')}
              actionLabel={t('savedPlaces.clearFilters')}
              onAction={clearFilter}
              testID="favorites-no-results"
            />
          )
        }
      />
      <SavedPlaceActionsSheet favorite={active ?? null} onClose={() => setActiveId(null)} />
      <CollectionNameSheet visible={creating} collection={null} onClose={() => setCreating(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
