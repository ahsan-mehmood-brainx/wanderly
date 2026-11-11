import { useLocalSearchParams } from 'expo-router';

import { DestinationScreen } from '@/features/destinations/presentation/screens/DestinationScreen';
import { InvalidLinkView } from '@/shared/navigation/InvalidLinkView';
import { parseRouteId, type DestinationRouteParams } from '@/shared/navigation/routes';

export default function DestinationRoute() {
  const destinationId = parseRouteId(useLocalSearchParams<DestinationRouteParams>().destinationId);
  return destinationId ? <DestinationScreen destinationId={destinationId} /> : <InvalidLinkView />;
}
