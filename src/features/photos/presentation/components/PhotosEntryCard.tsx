import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { routes } from '@/shared/navigation/routes';
import { AppCard, AppIcon, AppText } from '@/shared/ui';

import { useTripPhotos } from '../hooks/usePhotos';

const PREVIEW_COUNT = 4;

/** The way into a trip's photos from its details, with how many there are and the latest few. */
export function PhotosEntryCard({ tripId }: { readonly tripId: string }) {
  const { t } = useTranslation();
  const { spacing, radii, colors } = useAppTheme();
  const { screen, items } = useTripPhotos(tripId);
  const ready = screen.kind === 'ready';
  const summary =
    screen.kind === 'unsupported'
      ? t('photos.unsupportedTitle')
      : !ready
        ? ''
        : items.length > 0
          ? t('photos.count', { count: items.length })
          : t('photos.entryEmpty');
  const previews = ready ? items.filter((item) => item.displayUri !== null).slice(0, PREVIEW_COUNT) : [];

  return (
    <AppCard
      variant="outlined"
      onPress={() => router.push(routes.tripPhotos(tripId))}
      accessibilityLabel={summary ? t('photos.entryLabel', { summary }) : t('photos.entryTitle')}
      accessibilityHint={t('photos.entryHint')}
      testID="trip-photos-entry"
    >
      <View style={{ gap: spacing.sm }}>
        <View style={[styles.header, { gap: spacing.sm }]}>
          <AppIcon name="image" size="md" color="primary" />
          <AppText variant="headline" style={styles.fill}>
            {t('photos.entryTitle')}
          </AppText>
          <AppIcon name="chevronRight" size="sm" color="textSecondary" />
        </View>
        {summary ? (
          <AppText variant="callout" color="textSecondary">
            {summary}
          </AppText>
        ) : null}
        {previews.length > 0 ? (
          <View style={[styles.previews, { gap: spacing.xs }]}>
            {previews.map(({ photo, displayUri }) =>
              displayUri ? (
                <Image
                  key={photo.id}
                  source={{ uri: displayUri }}
                  recyclingKey={displayUri}
                  contentFit="cover"
                  accessible={false}
                  style={[styles.preview, { borderRadius: radii.sm, backgroundColor: colors.surfaceMuted }]}
                />
              ) : null,
            )}
          </View>
        ) : null}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  fill: { flex: 1 },
  previews: { flexDirection: 'row' },
  preview: { flex: 1, aspectRatio: 1, maxWidth: '25%' },
});
