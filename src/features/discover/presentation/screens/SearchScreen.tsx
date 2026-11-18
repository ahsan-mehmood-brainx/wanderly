import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { routes } from '@/shared/navigation/routes';
import {
  AppChip,
  AppEmptyView,
  AppErrorView,
  AppIcon,
  AppIconButton,
  AppInput,
  AppLoader,
  AppText,
  InlineMessage,
} from '@/shared/ui';

import { type DestinationCategory } from '../../domain/Destination';
import {
  countActiveFilters,
  hasActiveFilters,
  NO_FILTERS,
  populationRangeId,
  type SearchFilters,
} from '../../domain/SearchFilters';
import { CATEGORY_ICONS } from '../categoryIcons';
import { DestinationRow } from '../components/DestinationCards';
import { FilterSheet } from '../components/FilterSheet';
import { regionLabel } from '../format';
import { useDestinationSearch } from '../hooks/useDestinationSearch';
import { queryErrorKind, useFilterOptionsQuery } from '../state/discoverApi';

interface SearchScreenProps {
  readonly initialQuery?: string;
  readonly initialCategory?: DestinationCategory | null;
  /** Overridable for tests. */
  readonly debounceMs?: number;
}

/** Search countries, cities and places, with filters and recent searches. */
export function SearchScreen({ initialQuery = '', initialCategory = null, debounceMs }: SearchScreenProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useAppTheme();
  const search = useDestinationSearch({
    initialQuery,
    initialFilters: { ...NO_FILTERS, category: initialCategory },
    debounceMs,
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Loaded when the screen opens (shared, cached catalogue), so the sheet's pickers are ready.
  const options = useFilterOptionsQuery();
  const filterCount = countActiveFilters(search.filters);

  const openResult = (id: string) => {
    search.remember();
    router.push(routes.destination(id));
  };

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm }}>
        <AppInput
          value={search.query}
          onChangeText={search.setQuery}
          placeholder={t('search.placeholder')}
          accessibilityLabel={t('search.inputLabel')}
          leftIcon="search"
          clearable
          autoFocus={initialQuery === '' && initialCategory === null}
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={search.remember}
          testID="search-input"
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={{ marginHorizontal: -spacing.lg }}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, paddingVertical: spacing.xs }}
        >
          <AppChip
            label={filterCount > 0 ? t('search.filtersWithCount', { count: filterCount }) : t('search.filters')}
            icon="filter"
            selected={filterCount > 0}
            onPress={() => setFiltersOpen(true)}
            testID="open-filters"
          />
          <ActiveFilterChips filters={search.filters} onChange={search.setFilters} />
        </ScrollView>
      </View>

      <SearchBody search={search} onOpen={openResult} />

      <FilterSheet
        visible={filtersOpen}
        filters={search.filters}
        options={options.data}
        optionsUnavailable={queryErrorKind(options.error) !== null && !options.data}
        onClose={() => setFiltersOpen(false)}
        onApply={(filters) => {
          search.setFilters(filters);
          setFiltersOpen(false);
        }}
      />
    </View>
  );
}

type SearchState = ReturnType<typeof useDestinationSearch>;

function SearchBody({ search, onOpen }: { readonly search: SearchState; readonly onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const { colors, spacing } = useAppTheme();

  if (search.idle) return <RecentSearches search={search} />;
  if (search.errorKind) {
    return <AppErrorView errorKind={search.errorKind} onRetry={search.retry} fullScreen testID="search-error" />;
  }
  if (search.loading || !search.outcome) return <AppLoader label={t('search.searching')} fullScreen />;

  const { results, places } = search.outcome;
  const filtered = hasActiveFilters(search.filters);
  if (results.length === 0 && !search.busy) {
    return (
      <AppEmptyView
        fullScreen
        icon="search"
        title={t('search.emptyTitle')}
        message={filtered ? t('search.emptyMessageFiltered') : t('search.emptyMessage')}
        actionLabel={filtered ? t('search.clearFilters') : undefined}
        onAction={filtered ? search.clearFilters : undefined}
        testID="search-empty"
      />
    );
  }

  return (
    <FlatList
      data={results}
      keyExtractor={(destination) => destination.id}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }}
      ListHeaderComponent={
        <View style={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
          {places.status === 'failed' ? (
            <InlineMessage
              tone="warning"
              icon="warning"
              message={t('search.placesUnavailable')}
              testID="places-unavailable"
            />
          ) : null}
          <View style={styles.countRow}>
            <AppText variant="caption" color="textSecondary" accessibilityLiveRegion="polite">
              {t('search.resultCount', { count: results.length })}
            </AppText>
            {search.busy ? (
              <ActivityIndicator size="small" color={colors.primary} accessibilityLabel={t('search.searching')} />
            ) : null}
          </View>
        </View>
      }
      renderItem={({ item }) => <DestinationRow destination={item} onPress={() => onOpen(item.id)} />}
    />
  );
}

function RecentSearches({ search }: { readonly search: SearchState }) {
  const { t } = useTranslation();
  const { colors, spacing, sizes } = useAppTheme();

  if (search.history.length === 0) {
    return <AppEmptyView fullScreen icon="explore" title={t('search.idleTitle')} message={t('search.idleMessage')} />;
  }
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.xs }}
    >
      <View style={styles.historyHeader}>
        <AppText variant="sectionTitle" color="textSecondary" accessibilityRole="header">
          {t('search.recentSearches')}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('search.clearHistoryLabel')}
          onPress={search.clearHistory}
          hitSlop={spacing.md}
        >
          <AppText variant="label" color="primary">
            {t('search.clearHistory')}
          </AppText>
        </Pressable>
      </View>
      {search.history.map((entry) => (
        <View
          key={entry}
          style={[styles.historyRow, { borderBottomColor: colors.border, borderBottomWidth: sizes.hairline }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={entry}
            onPress={() => search.selectHistoryEntry(entry)}
            style={[styles.historyEntry, { gap: spacing.md }]}
          >
            <AppIcon name="history" size="md" color="textSecondary" />
            <AppText numberOfLines={1} style={styles.fill}>
              {entry}
            </AppText>
          </Pressable>
          <AppIconButton
            icon="close"
            color="textTertiary"
            accessibilityLabel={t('search.removeSearch', { query: entry })}
            onPress={() => search.forgetHistoryEntry(entry)}
          />
        </View>
      ))}
    </ScrollView>
  );
}

/** One removable chip per active filter. */
function ActiveFilterChips({
  filters,
  onChange,
}: {
  readonly filters: SearchFilters;
  readonly onChange: (filters: SearchFilters) => void;
}) {
  const { t } = useTranslation();
  const options = useFilterOptionsQuery().data;
  const chips: { key: keyof SearchFilters; label: string }[] = [];

  if (filters.category) chips.push({ key: 'category', label: t(`discover.categories.${filters.category}`) });
  if (filters.region) chips.push({ key: 'region', label: regionLabel(filters.region, t) });
  if (filters.countryCode) {
    const country = options?.countries.find((option) => option.code === filters.countryCode);
    chips.push({ key: 'countryCode', label: country?.name ?? filters.countryCode });
  }
  if (filters.currencyCode) chips.push({ key: 'currencyCode', label: filters.currencyCode });
  const range = populationRangeId(filters.population);
  if (range) chips.push({ key: 'population', label: t(`filters.populationRanges.${range}`) });

  return chips.map((chip) => (
    <AppChip
      key={chip.key}
      label={chip.label}
      icon={chip.key === 'category' && filters.category ? CATEGORY_ICONS[filters.category] : undefined}
      trailingIcon="close"
      accessibilityLabel={t('search.removeFilter', { label: chip.label })}
      onPress={() => onChange({ ...filters, [chip.key]: null })}
    />
  ));
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  historyRow: { flexDirection: 'row', alignItems: 'center' },
  historyEntry: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 48 },
});
