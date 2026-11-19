import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { type AppErrorKind } from '@/core/errors/AppError';
import { getErrorMessageKey } from '@/core/errors/errorMessages';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { type LocationSearchResult, SEARCH_QUERY_MIN } from '@/features/map/domain/Place';
import { AppBottomSheet, AppButton, AppIcon, AppInput, AppText, InlineMessage } from '@/shared/ui';

interface LocationSheetProps {
  readonly visible: boolean;
  readonly onSelect: (place: LocationSearchResult) => void;
  readonly onClose: () => void;
}

type SearchState =
  | { readonly status: 'idle' }
  /** Submitted with fewer than `SEARCH_QUERY_MIN` characters; no request is made. */
  | { readonly status: 'tooShort' }
  | { readonly status: 'searching' }
  | { readonly status: 'done'; readonly results: readonly LocationSearchResult[] }
  | { readonly status: 'failed'; readonly errorKind: AppErrorKind };

/**
 * Finds a place by name with the map's place search (the only part of the
 * itinerary that needs a connection; the form disables it while offline).
 */
export function LocationSheet({ visible, onSelect, onClose }: LocationSheetProps) {
  const { t, i18n } = useTranslation();
  const { spacing, colors, radii } = useAppTheme();
  const { searchPlaces } = useDependencies();
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>({ status: 'idle' });
  const inFlight = useRef<AbortController | null>(null);
  const [wasVisible, setWasVisible] = useState(visible);

  // The sheet stays mounted while hidden, so a search abandoned by closing it must not
  // leave it 'searching' (spinner shown, Search button disabled) when it opens again.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (!visible && state.status === 'searching') setState({ status: 'idle' });
  }

  // A search still running when the sheet closes or unmounts is abandoned.
  useEffect(() => {
    if (visible) return;
    inFlight.current?.abort();
    inFlight.current = null;
  }, [visible]);
  useEffect(() => () => inFlight.current?.abort(), []);

  const canSearch = query.trim().length >= SEARCH_QUERY_MIN;

  const changeQuery = (text: string) => {
    setQuery(text);
    // The hint goes once the query is long enough; it isn't shown again until a short one is submitted.
    if (state.status === 'tooShort' && text.trim().length >= SEARCH_QUERY_MIN) setState({ status: 'idle' });
  };

  const search = async () => {
    // The search would reject it as a bad request; say what's needed instead of "try again".
    if (!canSearch) {
      inFlight.current?.abort();
      inFlight.current = null;
      setState({ status: 'tooShort' });
      return;
    }
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setState({ status: 'searching' });
    const result = await searchPlaces.execute({ query, language: i18n.language, signal: controller.signal });
    if (controller.signal.aborted) return;
    inFlight.current = null;
    setState(
      result.ok ? { status: 'done', results: result.value } : { status: 'failed', errorKind: result.error.kind },
    );
  };

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      title={t('itinerary.placeSearch.title')}
      testID="place-search-sheet"
    >
      <View style={{ gap: spacing.md }}>
        <AppInput
          label={t('itinerary.placeSearch.searchLabel')}
          placeholder={t('itinerary.placeSearch.searchPlaceholder')}
          value={query}
          onChangeText={changeQuery}
          leftIcon="search"
          returnKeyType="search"
          autoCorrect={false}
          clearable
          onSubmitEditing={() => void search()}
        />
        <AppButton
          label={t('itinerary.placeSearch.search')}
          variant="outline"
          fullWidth
          disabled={!canSearch}
          loading={state.status === 'searching'}
          onPress={() => void search()}
        />
        {state.status === 'searching' ? (
          <ActivityIndicator accessibilityLabel={t('itinerary.placeSearch.searching')} color={colors.primary} />
        ) : null}
        {state.status === 'tooShort' ? (
          <AppText color="textSecondary">{t('itinerary.placeSearch.tooShort', { min: SEARCH_QUERY_MIN })}</AppText>
        ) : null}
        {state.status === 'failed' ? <InlineMessage message={t(getErrorMessageKey(state.errorKind))} /> : null}
        {state.status === 'done' && state.results.length === 0 ? (
          <AppText color="textSecondary">{t('itinerary.placeSearch.noResults')}</AppText>
        ) : null}
        {state.status === 'done' && state.results.length > 0 ? (
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={{ gap: spacing.xs }}>
              {state.results.map((place) => (
                <Pressable
                  key={place.id}
                  accessibilityRole="button"
                  accessibilityLabel={[place.name, place.subtitle].filter(Boolean).join(', ')}
                  onPress={() => onSelect(place)}
                  style={({ pressed }) => [
                    styles.result,
                    {
                      gap: spacing.md,
                      padding: spacing.md,
                      borderRadius: radii.md,
                      backgroundColor: pressed ? colors.surfacePressed : colors.surface,
                    },
                  ]}
                >
                  <AppIcon name="location" size="md" color="primary" />
                  <View style={styles.text}>
                    <AppText numberOfLines={1}>{place.name}</AppText>
                    {place.subtitle ? (
                      <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                        {place.subtitle}
                      </AppText>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        ) : null}
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  result: { flexDirection: 'row', alignItems: 'center' },
  text: { flex: 1 },
});
