import { useLocalSearchParams } from 'expo-router';

import { CollectionDetailsScreen } from '@/features/favorites/presentation/screens/CollectionDetailsScreen';
import { InvalidLinkView } from '@/shared/navigation/InvalidLinkView';
import { type CollectionRouteParams, parseRouteId } from '@/shared/navigation/routes';

export default function CollectionRoute() {
  const collectionId = parseRouteId(useLocalSearchParams<CollectionRouteParams>().collectionId);
  return collectionId ? <CollectionDetailsScreen collectionId={collectionId} /> : <InvalidLinkView />;
}
