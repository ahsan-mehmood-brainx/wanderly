import { useLocales } from 'expo-localization';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { favoriteTargetFromPlace } from '@/features/favorites/domain/Favorite';
import { FavoriteButton } from '@/features/favorites/presentation/components/FavoriteButton';
import { useFavoriteToggle } from '@/features/favorites/presentation/hooks/useFavoriteToggle';
import { AppBottomSheet, AppButton, AppIcon, type AppIconName, AppText, InlineMessage } from '@/shared/ui';

import { PLACE_CATEGORY_ICONS } from '../categoryIcons';
import { distanceUnitsForLocale, formatDistance } from '../format';
import { type MapSelection } from '../hooks/useExploreMap';

interface PlaceSheetProps {
  readonly selection: MapSelection | null;
  readonly onClose: () => void;
  readonly onDirections: () => void;
  readonly directionsFailed: boolean;
  readonly onRemovePin: () => void;
  /** Resolves `false` when no browser could open the link. */
  readonly onOpenWebsite: (url: string) => Promise<boolean>;
}

function DetailRow({
  icon,
  label,
  value,
}: {
  readonly icon: AppIconName;
  readonly label: string;
  readonly value: string;
}) {
  const { spacing } = useAppTheme();
  return (
    <View style={[styles.row, { gap: spacing.md }]} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppIcon name={icon} size="md" color="textSecondary" />
      <View style={styles.rowText}>
        <AppText variant="caption" color="textSecondary">
          {label}
        </AppText>
        <AppText selectable>{value}</AppText>
      </View>
    </View>
  );
}

/** Details of the selected place or pin, with Directions, Save for places (not hotels), and Remove for a pin. */
export function PlaceSheet({
  selection,
  onClose,
  onDirections,
  directionsFailed,
  onRemovePin,
  onOpenWebsite,
}: PlaceSheetProps) {
  const { t, i18n } = useTranslation();
  const { spacing } = useAppTheme();
  const [locale] = useLocales();
  const [websiteFailed, setWebsiteFailed] = useState(false);
  // Keep showing the last selection while the sheet slides away.
  const [shown, setShown] = useState(selection);
  if (selection !== null && selection !== shown) {
    setShown(selection);
    setWebsiteFailed(false);
  }
  const current = selection ?? shown;
  const favoriteTarget = useMemo(
    () => (current?.type === 'place' ? favoriteTargetFromPlace(current.place) : null),
    [current],
  );
  const favorite = useFavoriteToggle(favoriteTarget);

  let title: string | undefined;
  let content = null;
  if (current?.type === 'place') {
    const { place } = current;
    const { website } = place;
    title = place.name;
    content = (
      <>
        <View style={[styles.row, { gap: spacing.sm }]}>
          <AppIcon name={PLACE_CATEGORY_ICONS[place.category]} size="sm" color="primary" />
          <AppText variant="label" color="primary">
            {t(`map.categories.${place.category}`)}
          </AppText>
          <AppText variant="label" color="textSecondary">
            {formatDistance(place.distanceMeters, distanceUnitsForLocale(locale), i18n.language, t)}
          </AppText>
        </View>
        {place.address ? <DetailRow icon="location" label={t('map.sheet.address')} value={place.address} /> : null}
        {place.openingHours ? (
          <DetailRow icon="clock" label={t('map.sheet.openingHours')} value={place.openingHours} />
        ) : null}
        {place.phone ? <DetailRow icon="phone" label={t('map.sheet.phone')} value={place.phone} /> : null}
        {website ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${t('map.sheet.website')}: ${website}`}
            onPress={() => void onOpenWebsite(website).then((opened) => setWebsiteFailed(!opened))}
            style={[styles.row, { gap: spacing.md }]}
          >
            <AppIcon name="link" size="md" color="textSecondary" />
            <View style={styles.rowText}>
              <AppText variant="caption" color="textSecondary">
                {t('map.sheet.website')}
              </AppText>
              <AppText color="primary" numberOfLines={1}>
                {website}
              </AppText>
            </View>
          </Pressable>
        ) : null}
        {websiteFailed ? <InlineMessage tone="danger" icon="error" message={t('map.sheet.websiteFailed')} /> : null}
      </>
    );
  } else if (current?.type === 'pin') {
    title = t('map.droppedPin');
    content = (
      <View style={[styles.row, { gap: spacing.sm }]}>
        <AppIcon name="pin" size="sm" color="textSecondary" />
        <AppText selectable>{current.label}</AppText>
      </View>
    );
  }

  return (
    <AppBottomSheet visible={selection !== null} onClose={onClose} title={title} testID="place-sheet">
      <View style={{ gap: spacing.lg }}>
        {content}
        {directionsFailed ? (
          <InlineMessage tone="danger" icon="error" message={t('map.sheet.directionsFailed')} />
        ) : null}
        {favorite.errorKind ? (
          <InlineMessage tone="danger" icon="error" message={t('savedPlaces.saveFailed')} />
        ) : favorite.savedStateUnknown ? (
          <InlineMessage tone="warning" icon="warning" message={t('savedPlaces.savedStateUnknown')} />
        ) : null}
        <View style={[styles.actions, { gap: spacing.sm }]}>
          <AppButton label={t('map.sheet.directions')} leftIcon="directions" onPress={onDirections} />
          {favoriteTarget ? (
            <FavoriteButton
              variant="button"
              saved={favorite.saved}
              saving={favorite.saving}
              onPress={() => void favorite.toggle()}
            />
          ) : null}
          {current?.type === 'pin' ? (
            <AppButton label={t('map.sheet.remove')} variant="outline" leftIcon="close" onPress={onRemovePin} />
          ) : null}
        </View>
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  rowText: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap' },
});
