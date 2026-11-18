import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getErrorMessageKey } from '@/core/errors/errorMessages';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppButton, AppEmptyView, AppIconButton, AppInput, AppLoader, AppText, InlineMessage } from '@/shared/ui';

import { MAX_CUSTOM_MARKERS, SEARCH_QUERY_MAX, SEARCH_QUERY_MIN } from '../../domain/Place';
import { CategoryChips } from '../components/CategoryChips';
import { MapCanvas } from '../components/MapCanvas';
import { PlaceSheet } from '../components/PlaceSheet';
import { type ExploreMapState, useExploreMap } from '../hooks/useExploreMap';
import { type MapLocationState } from '../hooks/useMapLocation';

/** A floating card over the map, readable in light and dark mode. */
function Panel({ children }: { readonly children: React.ReactNode }) {
  const { colors, spacing, radii, shadows } = useAppTheme();
  return (
    <View
      style={[
        shadows.sm,
        { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md, gap: spacing.md },
      ]}
    >
      {children}
    </View>
  );
}

function LocationStatus({ state }: { readonly state: MapLocationState }) {
  const { t } = useTranslation();
  const [openSettingsFailed, setOpenSettingsFailed] = useState(false);

  switch (state.status) {
    case 'checking':
    case 'located':
      return null;
    case 'needsPermission':
      return (
        <Panel>
          <AppText color="textSecondary">{t('map.permission.prompt')}</AppText>
          <AppButton
            label={t('map.permission.allow')}
            leftIcon="myLocation"
            size="sm"
            loading={state.requesting}
            onPress={state.request}
          />
        </Panel>
      );
    case 'blocked':
      return (
        <Panel>
          <AppText color="textSecondary">{t('map.permission.blocked')}</AppText>
          <AppButton
            label={t('map.permission.openSettings')}
            variant="outline"
            size="sm"
            leftIcon="settings"
            onPress={() => void state.openSettings().then((opened) => setOpenSettingsFailed(!opened))}
          />
          {openSettingsFailed ? (
            <InlineMessage tone="danger" icon="error" message={t('map.permission.openSettingsFailed')} />
          ) : null}
        </Panel>
      );
    case 'locating':
      return (
        <Panel>
          <AppLoader size="small" label={t('map.locating')} style={styles.compactLoader} />
        </Panel>
      );
    case 'locationError':
      return (
        <Panel>
          <InlineMessage
            tone="warning"
            icon="location"
            message={
              state.errorKind === 'locationServicesDisabled'
                ? t(getErrorMessageKey(state.errorKind))
                : t('map.locationNotFound')
            }
          />
          <AppButton
            label={t('common.tryAgain')}
            variant="outline"
            size="sm"
            leftIcon="refresh"
            onPress={state.retry}
          />
        </Panel>
      );
  }
}

function PlacesStatus({ state }: { readonly state: ExploreMapState['placesState'] }) {
  const { t } = useTranslation();
  switch (state.status) {
    case 'idle':
    case 'ready':
      return null;
    case 'loading':
      return (
        <Panel>
          <AppLoader size="small" label={t('map.loadingPlaces')} style={styles.compactLoader} />
        </Panel>
      );
    case 'empty':
      return (
        <Panel>
          <InlineMessage tone="info" icon="info" message={t('map.noPlaces')} />
        </Panel>
      );
    case 'noCategories':
      return (
        <Panel>
          <InlineMessage tone="info" icon="filter" message={t('map.noCategories')} />
        </Panel>
      );
    case 'noMatches':
      return (
        <Panel>
          <InlineMessage tone="info" icon="filter" message={t('map.noMatchingPlaces')} />
        </Panel>
      );
    case 'error':
      return (
        <Panel>
          <InlineMessage tone="warning" icon="warning" message={t(getErrorMessageKey(state.errorKind))} />
          <AppButton
            label={t('common.tryAgain')}
            variant="outline"
            size="sm"
            leftIcon="refresh"
            onPress={state.retry}
          />
        </Panel>
      );
  }
}

function SearchResults({ map }: { readonly map: ExploreMapState }) {
  const { t } = useTranslation();
  const { colors, spacing, radii } = useAppTheme();
  const { search } = map;
  if (!map.resultsOpen || search.status === 'idle') return null;

  let content;
  switch (search.status) {
    case 'tooShort':
      content = <AppText color="textSecondary">{t('map.searchTooShort', { min: SEARCH_QUERY_MIN })}</AppText>;
      break;
    case 'loading':
      content = <AppLoader size="small" label={t('map.searching')} style={styles.compactLoader} />;
      break;
    case 'empty':
      content = <AppText color="textSecondary">{t('map.noSearchResults', { query: search.query })}</AppText>;
      break;
    case 'error':
      content = <InlineMessage tone="warning" icon="warning" message={t(getErrorMessageKey(search.errorKind))} />;
      break;
    case 'results':
      content = (
        <ScrollView keyboardShouldPersistTaps="handled" style={styles.results}>
          {search.results.map((result) => (
            <Pressable
              key={result.id}
              accessibilityRole="button"
              accessibilityLabel={result.subtitle ? `${result.name}, ${result.subtitle}` : result.name}
              onPress={() => map.pickResult(result)}
              style={({ pressed }) => [
                { paddingVertical: spacing.sm, borderRadius: radii.sm },
                pressed ? { backgroundColor: colors.surfacePressed } : null,
              ]}
            >
              <AppText variant="headline" numberOfLines={1}>
                {result.name}
              </AppText>
              {result.subtitle ? (
                <AppText variant="caption" color="textSecondary" numberOfLines={2}>
                  {result.subtitle}
                </AppText>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      );
      break;
  }

  return (
    <Panel>
      <View style={[styles.row, { gap: spacing.sm }]}>
        <View style={styles.fill}>{content}</View>
        <AppIconButton icon="close" accessibilityLabel={t('map.closeResults')} onPress={map.closeResults} />
      </View>
    </Panel>
  );
}

function PinNotice({ map }: { readonly map: ExploreMapState }) {
  const { t } = useTranslation();
  if (!map.notice) return null;
  return (
    <InlineMessage
      tone={map.notice === 'pinLimit' ? 'info' : 'danger'}
      icon={map.notice === 'pinLimit' ? 'info' : 'error'}
      message={map.notice === 'pinLimit' ? t('map.pinLimit', { max: MAX_CUSTOM_MARKERS }) : t('map.pinSaveFailed')}
      dismissLabel={t('common.dismiss')}
      onDismiss={map.dismissNotice}
    />
  );
}

/**
 * While a search result is shown, locating progress and errors are noise, but the
 * permission card stays: without it there is no way back to the device position.
 */
function showsLocationStatus({ searchTarget, location }: ExploreMapState): boolean {
  return !searchTarget || location.status === 'needsPermission' || location.status === 'blocked';
}

/** Explore map with nearby places, search, filters, pins and directions. */
export function ExploreMapScreen() {
  const { t } = useTranslation();
  const { colors, spacing, radii } = useAppTheme();
  const insets = useSafeAreaInsets();
  const map = useExploreMap();

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      {map.map.status === 'showing' ? (
        <MapCanvas
          key={map.map.mountKey}
          center={map.center}
          recenterRequest={map.recenterRequest}
          showsUserLocation={map.showsUserLocation}
          places={map.places}
          searchTarget={map.searchTarget}
          pins={map.customMarkers}
          onSelectPlace={map.selectPlace}
          onSelectPin={map.selectPin}
          onLongPress={map.addPin}
          onReady={map.map.onReady}
        />
      ) : (
        <AppEmptyView
          fullScreen
          icon="map"
          title={t('map.unavailable.title')}
          message={t('map.unavailable.message')}
          actionLabel={map.map.status === 'failed' ? t('common.tryAgain') : undefined}
          onAction={map.map.status === 'failed' ? map.map.retry : undefined}
        />
      )}

      <View style={[styles.top, { paddingTop: spacing.md, gap: spacing.sm }]} pointerEvents="box-none">
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }} pointerEvents="box-none">
          <AppInput
            value={map.query}
            onChangeText={map.setQuery}
            onSubmitEditing={map.submitSearch}
            accessibilityLabel={t('map.searchLabel')}
            placeholder={t('map.searchPlaceholder')}
            leftIcon="search"
            clearable
            returnKeyType="search"
            autoCorrect={false}
            maxLength={SEARCH_QUERY_MAX}
            containerStyle={{ borderRadius: radii.md, backgroundColor: colors.surface }}
          />
          <SearchResults map={map} />
        </View>
        <CategoryChips selected={map.categories} onToggle={map.toggleCategory} />
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }} pointerEvents="box-none">
          {showsLocationStatus(map) ? <LocationStatus state={map.location} /> : null}
          <PlacesStatus state={map.placesState} />
          <PinNotice map={map} />
        </View>
      </View>

      <View
        pointerEvents="box-none"
        style={[styles.bottom, { paddingHorizontal: spacing.lg, paddingBottom: Math.max(insets.bottom, spacing.md) }]}
      >
        <View style={[styles.row, styles.bottomRow]} pointerEvents="box-none">
          <AppText
            variant="caption"
            color="textSecondary"
            accessibilityHint={t('map.attributionHint')}
            style={[
              styles.attribution,
              { backgroundColor: colors.surface, borderRadius: radii.sm, padding: spacing.xs },
            ]}
          >
            {t('map.attribution')}
          </AppText>
          {map.returnToDevice ? (
            <AppIconButton
              icon="myLocation"
              variant="surface"
              color="primary"
              accessibilityLabel={t('map.myLocation')}
              onPress={map.returnToDevice}
            />
          ) : null}
        </View>
      </View>

      <PlaceSheet
        selection={map.selection}
        onClose={map.clearSelection}
        onDirections={map.openDirections}
        directionsFailed={map.directionsFailed}
        onRemovePin={map.removeSelectedPin}
        onOpenWebsite={map.openWebsite}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  bottomRow: { justifyContent: 'space-between' },
  attribution: { overflow: 'hidden', opacity: 0.9 },
  results: { maxHeight: 280 },
  compactLoader: { padding: 0, flexDirection: 'row' },
});
