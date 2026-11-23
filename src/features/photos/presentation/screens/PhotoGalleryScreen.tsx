import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { routes } from '@/shared/navigation/routes';
import { AppEmptyView, AppText } from '@/shared/ui';

import { AddPhotoMenu } from '../components/AddPhotoMenu';
import { PhotoGrid } from '../components/PhotoGrid';
import { PhotosStateView } from '../components/PhotosStateView';
import { useAddPhotos } from '../hooks/useAddPhotos';
import { usePhotoGallery } from '../hooks/usePhotos';

interface PhotoGalleryScreenProps {
  /** Validated by the route. */
  readonly tripId: string;
  /** Set for an activity's gallery; the trip gallery shows every photo of the trip. */
  readonly activityId?: string;
}

/** The trip gallery (`/trips/:tripId/photos`) and an activity's gallery (`/trips/:tripId/itinerary/:itemId/photos`). */
export function PhotoGalleryScreen({ tripId, activityId }: PhotoGalleryScreenProps) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const forActivity = activityId ?? null;
  const { screen, items, trip, activity, retry } = usePhotoGallery(tripId, forActivity);
  const addPhotos = useAddPhotos({ tripId, activityId: forActivity });

  if (screen.kind !== 'ready') return <PhotosStateView state={screen} tripId={tripId} onRetry={retry} />;

  const title = activity?.title ?? trip?.title ?? '';
  return (
    <PhotoGrid
      testID="photo-gallery"
      items={items}
      showActivity={forActivity === null}
      onOpen={(photo) => router.push(routes.photo(tripId, photo.id, forActivity))}
      header={
        <View style={{ gap: spacing.md }}>
          <View style={{ gap: spacing.xxs }}>
            <AppText variant="title" accessibilityRole="header">
              {title}
            </AppText>
            {items.length > 0 ? (
              <AppText variant="callout" color="textSecondary">
                {t('photos.count', { count: items.length })}
              </AppText>
            ) : null}
          </View>
          <AddPhotoMenu flow={addPhotos} />
        </View>
      }
      empty={
        <AppEmptyView
          icon="image"
          title={t('photos.emptyTitle')}
          message={t('photos.emptyMessage')}
          testID="photo-gallery-empty"
        />
      }
    />
  );
}
