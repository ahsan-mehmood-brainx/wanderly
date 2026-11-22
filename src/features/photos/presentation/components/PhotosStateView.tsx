import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { routes } from '@/shared/navigation/routes';
import { AppEmptyView, AppErrorView, AppLoader } from '@/shared/ui';

import { type PhotosScreenState } from '../hooks/usePhotos';

interface PhotosStateViewProps {
  readonly state: Exclude<PhotosScreenState, { readonly kind: 'ready' }>;
  readonly tripId: string;
  readonly onRetry: () => void;
}

/** What a photo screen shows while loading, after a failure, when something is gone, or on web. */
export function PhotosStateView({ state, tripId, onRetry }: PhotosStateViewProps) {
  const { t } = useTranslation();
  switch (state.kind) {
    case 'unsupported':
      return (
        <AppEmptyView
          fullScreen
          icon="image"
          title={t('photos.unsupportedTitle')}
          message={t('photos.unsupportedMessage')}
          testID="photos-unsupported"
        />
      );
    case 'loading':
      return <AppLoader fullScreen />;
    case 'failed':
      return <AppErrorView fullScreen errorKind={state.errorKind ?? undefined} onRetry={onRetry} />;
    case 'tripNotFound':
      return (
        <AppEmptyView
          fullScreen
          icon="luggage"
          title={t('trips.notFoundTitle')}
          message={t('trips.notFoundMessage')}
          actionLabel={t('trips.backToTrips')}
          onAction={() => router.navigate(routes.trips)}
          testID="photos-trip-not-found"
        />
      );
    case 'activityNotFound':
      return (
        <AppEmptyView
          fullScreen
          icon="calendar"
          title={t('itinerary.notFoundTitle')}
          message={t('itinerary.notFoundMessage')}
          actionLabel={t('itinerary.backToItinerary')}
          onAction={() => router.navigate(routes.itinerary(tripId))}
          testID="photos-activity-not-found"
        />
      );
  }
}
