import { useLocalSearchParams } from 'expo-router';

import { PhotoGalleryScreen } from '@/features/photos/presentation/screens/PhotoGalleryScreen';
import { InvalidLinkView } from '@/shared/navigation/InvalidLinkView';
import { type ItineraryItemRouteParams, parseRouteId } from '@/shared/navigation/routes';

export default function ActivityPhotosRoute() {
  const params = useLocalSearchParams<ItineraryItemRouteParams>();
  const tripId = parseRouteId(params.tripId);
  const itemId = parseRouteId(params.itemId);
  return tripId && itemId ? <PhotoGalleryScreen tripId={tripId} activityId={itemId} /> : <InvalidLinkView />;
}
