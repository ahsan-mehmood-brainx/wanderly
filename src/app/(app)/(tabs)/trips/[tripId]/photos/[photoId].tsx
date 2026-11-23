import { useLocalSearchParams } from 'expo-router';

import { PhotoViewerScreen } from '@/features/photos/presentation/screens/PhotoViewerScreen';
import { InvalidLinkView } from '@/shared/navigation/InvalidLinkView';
import { parseRouteId, type PhotoRouteParams } from '@/shared/navigation/routes';

export default function PhotoRoute() {
  const params = useLocalSearchParams<PhotoRouteParams>();
  const tripId = parseRouteId(params.tripId);
  const photoId = parseRouteId(params.photoId);
  const activityId = params.activityId === undefined ? null : parseRouteId(params.activityId);
  const validActivity = params.activityId === undefined || activityId !== null;
  return tripId && photoId && validActivity ? (
    <PhotoViewerScreen tripId={tripId} photoId={photoId} activityId={activityId} />
  ) : (
    <InvalidLinkView />
  );
}
