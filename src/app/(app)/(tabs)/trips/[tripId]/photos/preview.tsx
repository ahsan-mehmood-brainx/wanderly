import { useLocalSearchParams } from 'expo-router';

import { PhotoPreviewScreen } from '@/features/photos/presentation/screens/PhotoPreviewScreen';
import { InvalidLinkView } from '@/shared/navigation/InvalidLinkView';
import { parseRouteId, type PhotoFlowRouteParams } from '@/shared/navigation/routes';

export default function PhotoPreviewRoute() {
  const params = useLocalSearchParams<PhotoFlowRouteParams>();
  const tripId = parseRouteId(params.tripId);
  const activityId = params.activityId === undefined ? null : parseRouteId(params.activityId);
  const validActivity = params.activityId === undefined || activityId !== null;
  return tripId && validActivity ? <PhotoPreviewScreen tripId={tripId} activityId={activityId} /> : <InvalidLinkView />;
}
