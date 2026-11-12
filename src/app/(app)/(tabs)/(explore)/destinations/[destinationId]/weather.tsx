import { useLocalSearchParams } from 'expo-router';

import { parseDestinationId } from '@/features/discover/domain/DestinationId';
import { DestinationWeatherScreen } from '@/features/discover/presentation/screens/DestinationWeatherScreen';
import { InvalidLinkView } from '@/shared/navigation/InvalidLinkView';
import { type DestinationRouteParams, parseDestinationRouteId } from '@/shared/navigation/routes';

export default function DestinationWeatherRoute() {
  const destinationId = parseDestinationRouteId(useLocalSearchParams<DestinationRouteParams>().destinationId);
  return destinationId && parseDestinationId(destinationId) ? (
    <DestinationWeatherScreen destinationId={destinationId} />
  ) : (
    <InvalidLinkView />
  );
}
