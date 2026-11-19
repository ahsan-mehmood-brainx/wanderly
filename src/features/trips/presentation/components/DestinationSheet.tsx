import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useAppDispatch, useAppSelector } from '@/core/store/hooks';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { CURATED_DESTINATIONS } from '@/features/discover/domain/editorial';
import { NO_FILTERS } from '@/features/discover/domain/SearchFilters';
import { matchCurated, normalizeQuery, normalizeText } from '@/features/discover/domain/searchMatching';
import { useDebouncedValue } from '@/features/discover/presentation/hooks/useDebouncedValue';
import { useSearchDestinationsQuery } from '@/features/discover/presentation/state/discoverApi';
import { loadDiscoveryHistory } from '@/features/discover/presentation/state/discoverSlice';
import { selectRecentlyViewed } from '@/features/discover/presentation/state/selectors';
import { AppBottomSheet, AppIcon, type AppIconName, AppInput, AppLoader, AppText, InlineMessage } from '@/shared/ui';

import { customDestination, TRIP_LIMITS, type TripDestination } from '../../domain/Trip';

interface DestinationSheetProps {
  readonly visible: boolean;
  readonly onSelect: (destination: TripDestination) => void;
  readonly onClose: () => void;
}

interface Row extends TripDestination {
  readonly subtitle: string | null;
}

const MAX_ROWS = 20;
const MAX_SUGGESTIONS = 8;

/** Picks a destination. The sheet mounts its content only while open, so closed sheets cost nothing. */
export function DestinationSheet({ visible, onSelect, onClose }: DestinationSheetProps) {
  const { t } = useTranslation();
  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      title={t('trips.destinationPicker.title')}
      testID="destination-sheet"
    >
      <DestinationPicker onSelect={onSelect} />
    </AppBottomSheet>
  );
}

/**
 * Online this is Discover's search. Trips must also work offline, so suggestions
 * come from what's on the device (recently viewed and curated places), typing
 * filters the curated list locally, and any typed name can be used as is.
 */
function DestinationPicker({ onSelect }: Pick<DestinationSheetProps, 'onSelect'>) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const dispatch = useAppDispatch();
  const recent = useAppSelector(selectRecentlyViewed);
  const [query, setQuery] = useState('');
  const [debounced] = useDebouncedValue(query);

  useEffect(() => {
    void dispatch(loadDiscoveryHistory());
  }, [dispatch]);

  const typed = normalizeQuery(query);
  const searchText = normalizeQuery(debounced);
  const idle = !normalizeText(searchText);
  const search = useSearchDestinationsQuery({ query: searchText, filters: NO_FILTERS }, { skip: idle });

  const suggestions = useMemo<Row[]>(() => {
    const rows: Row[] = recent.map(({ id, name, countryName }) => ({ id, name, subtitle: countryName }));
    for (const { slug, name } of CURATED_DESTINATIONS) {
      if (!rows.some((row) => row.id === slug)) rows.push({ id: slug, name, subtitle: null });
    }
    return rows.slice(0, MAX_SUGGESTIONS);
  }, [recent]);

  const results = useMemo<Row[]>(() => {
    if (search.currentData) {
      return search.currentData.results
        .slice(0, MAX_ROWS)
        .map(({ id, name, countryName }) => ({ id, name, subtitle: countryName === name ? null : countryName }));
    }
    return matchCurated(normalizeText(typed), CURATED_DESTINATIONS, new Map())
      .sort((a, b) => b.score - a.score)
      .map(({ destination: { id, name } }) => ({ id, name, subtitle: null }));
  }, [search.currentData, typed]);

  const hasQuery = Boolean(normalizeText(typed));
  const rows = hasQuery ? results : suggestions;
  const canUseTyped = hasQuery && typed.length <= TRIP_LIMITS.destinationNameMaxLength;
  const searching = hasQuery && (query !== debounced || search.isFetching);

  return (
    <View style={[styles.fill, { gap: spacing.md }]}>
      <AppInput
        label={t('trips.destinationPicker.searchLabel')}
        placeholder={t('trips.destinationPicker.searchPlaceholder')}
        leftIcon="search"
        value={query}
        onChangeText={setQuery}
        clearable
        autoCorrect={false}
        returnKeyType="search"
      />
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.fill} contentContainerStyle={{ gap: spacing.xxs }}>
        {canUseTyped ? (
          <DestinationRow
            icon="add"
            title={t('trips.destinationPicker.useTyped', { name: typed })}
            subtitle={t('trips.destinationPicker.useTypedHint')}
            onPress={() => onSelect(customDestination(typed))}
          />
        ) : null}
        {hasQuery && !searching && search.isError ? (
          <InlineMessage tone="info" icon="info" message={t('trips.destinationPicker.searchUnavailable')} />
        ) : null}
        <AppText variant="sectionTitle" color="textSecondary" accessibilityRole="header">
          {hasQuery ? t('trips.destinationPicker.results') : t('trips.destinationPicker.suggestions')}
        </AppText>
        {rows.map((row) => (
          <DestinationRow
            key={row.id}
            icon="location"
            title={row.name}
            subtitle={row.subtitle}
            onPress={() => onSelect({ id: row.id, name: row.name })}
          />
        ))}
        {searching && rows.length === 0 ? (
          <AppLoader size="small" label={t('trips.destinationPicker.searching')} />
        ) : null}
        {hasQuery && !searching && rows.length === 0 ? (
          <AppText color="textSecondary">{t('trips.destinationPicker.noResults')}</AppText>
        ) : null}
      </ScrollView>
    </View>
  );
}

interface DestinationRowProps {
  readonly icon: AppIconName;
  readonly title: string;
  readonly subtitle: string | null;
  readonly onPress: () => void;
}

function DestinationRow({ icon, title, subtitle, onPress }: DestinationRowProps) {
  const { colors, spacing, radii, sizes } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: sizes.touchTarget,
          gap: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radii.sm,
          backgroundColor: pressed ? colors.surfacePressed : undefined,
        },
      ]}
    >
      <AppIcon name={icon} size="md" color="primary" />
      <View style={styles.fill}>
        <AppText numberOfLines={1}>{title}</AppText>
        {subtitle ? (
          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
