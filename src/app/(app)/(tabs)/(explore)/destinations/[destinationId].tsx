import { useLocalSearchParams } from 'expo-router';

import { parseDestinationId } from '@/features/discover/domain/DestinationId';
import { DestinationScreen } from '@/features/discover/presentation/screens/DestinationScreen';
import { InvalidLinkView } from '@/shared/navigation/InvalidLinkView';
import { type DestinationRouteParams, parseDestinationRouteId } from '@/shared/navigation/routes';

export default function DestinationRoute() {
  const destinationId = parseDestinationRouteId(useLocalSearchParams<DestinationRouteParams>().destinationId);
  return destinationId && parseDestinationId(destinationId) ? (
    <DestinationScreen destinationId={destinationId} />
  ) : (
    <InvalidLinkView />
  );
}
