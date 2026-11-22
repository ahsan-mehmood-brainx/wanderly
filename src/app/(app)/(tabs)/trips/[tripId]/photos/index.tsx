import { useLocalSearchParams } from 'expo-router';

import { PhotoGalleryScreen } from '@/features/photos/presentation/screens/PhotoGalleryScreen';
import { InvalidLinkView } from '@/shared/navigation/InvalidLinkView';
import { parseRouteId, type TripRouteParams } from '@/shared/navigation/routes';

export default function TripPhotosRoute() {
  const params = useLocalSearchParams<TripRouteParams>();
  const tripId = parseRouteId(params.tripId);
  return tripId ? <PhotoGalleryScreen tripId={tripId} /> : <InvalidLinkView />;
}
