import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { routes } from '@/shared/navigation/routes';
import { AppButton, AppCard, AppText } from '@/shared/ui';

import { useActivityPhotos } from '../hooks/usePhotos';
import { PhotoTile } from './PhotoTile';

const PREVIEW_COUNT = 6;
const COLUMNS = 3;

interface ActivityPhotosSectionProps {
  readonly tripId: string;
  readonly activityId: string;
}

/** The latest photos of an activity on its details, with the way into its gallery. */
export function ActivityPhotosSection({ tripId, activityId }: ActivityPhotosSectionProps) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const { screen, items } = useActivityPhotos(tripId, activityId);
  const ready = screen.kind === 'ready';
  const previews = ready ? items.slice(0, PREVIEW_COUNT) : [];
  const gap = spacing.xxs;

  return (
    <AppCard variant="outlined" testID="activity-photos">
      <View style={{ gap: spacing.md }}>
        <View style={[styles.header, { gap: spacing.sm }]}>
          <AppText variant="headline" accessibilityRole="header" style={styles.fill}>
            {t('photos.sectionTitle')}
          </AppText>
          {ready && items.length > 0 ? (
            <AppText variant="callout" color="textSecondary">
              {t('photos.count', { count: items.length })}
            </AppText>
          ) : null}
        </View>
        {screen.kind === 'unsupported' ? (
          <AppText variant="callout" color="textSecondary">
            {t('photos.unsupportedTitle')}
          </AppText>
        ) : ready && items.length === 0 ? (
          <AppText variant="callout" color="textSecondary">
            {t('photos.sectionEmpty')}
          </AppText>
        ) : null}
        {previews.length > 0 ? (
          <View style={[styles.grid, { margin: -gap }]}>
            {previews.map((item) => (
              <View key={item.photo.id} style={[styles.cell, { padding: gap }]}>
                <PhotoTile
                  item={item}
                  showActivity={false}
                  onPress={() => router.push(routes.photo(tripId, item.photo.id, activityId))}
                />
              </View>
            ))}
          </View>
        ) : null}
        <AppButton
          label={items.length > 0 ? t('photos.viewAll') : t('photos.addPhoto')}
          variant="outline"
          leftIcon={items.length > 0 ? 'image' : 'add'}
          fullWidth
          onPress={() => router.push(routes.activityPhotos(tripId, activityId))}
        />
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  fill: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / COLUMNS}%` },
});
