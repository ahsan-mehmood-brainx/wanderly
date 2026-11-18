import { useLocalSearchParams } from 'expo-router';

import { isDestinationCategory } from '@/features/discover/domain/Destination';
import { SearchScreen } from '@/features/discover/presentation/screens/SearchScreen';
import { type SearchRouteParams } from '@/shared/navigation/routes';

/** Route params come from links, so they are validated: an unknown category is ignored, the query is capped. */
export default function SearchRoute() {
  const { q, category } = useLocalSearchParams<SearchRouteParams>();
  return (
    <SearchScreen
      initialQuery={typeof q === 'string' ? q.slice(0, 100) : ''}
      initialCategory={isDestinationCategory(category) ? category : null}
    />
  );
}
