import { useEffect, useMemo } from 'react';

import { useAppDispatch, useAppSelector } from '@/core/store/hooks';
import { selectCurrentUser } from '@/features/auth/presentation/state/selectors';

import { type DestinationSummary, type RecentDestination } from '../../domain/Destination';
import {
  queryErrorKind,
  useCuratedCollectionQuery,
  usePopularCountriesQuery,
  useRecommendationsQuery,
} from '../state/discoverApi';
import { clearRecentlyViewed, loadDiscoveryHistory } from '../state/discoverSlice';
import { selectDiscoveryHistoryReady, selectRecentlyViewed } from '../state/selectors';

/** Recently viewed entries render with the same row as other destinations. */
export function recentToSummary(recent: RecentDestination): DestinationSummary {
  return {
    id: recent.id,
    kind: recent.kind,
    name: recent.name,
    countryCode: recent.countryCode,
    countryName: recent.kind === 'country' ? null : recent.countryName,
    region: null,
    description: null,
    imageUrl: recent.imageUrl,
    flagEmoji: recent.flagEmoji,
    categories: [],
    isCapital: false,
  };
}

/** Wraps an RTK Query result in the shape every home section renders. */
function section<T>(query: { data?: T; isLoading: boolean; error?: unknown; refetch: () => unknown }) {
  return {
    data: query.data,
    loading: query.isLoading,
    errorKind: query.data === undefined ? queryErrorKind(query.error) : null,
    retry: () => void query.refetch(),
  };
}

/** View model for the discover home: greeting name, each feed section with its own state, and history. */
export function useDiscoverHome() {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectCurrentUser);
  const historyReady = useAppSelector(selectDiscoveryHistoryReady);
  const recentlyViewed = useAppSelector(selectRecentlyViewed);

  useEffect(() => {
    void dispatch(loadDiscoveryHistory());
  }, [dispatch]);

  const featured = useCuratedCollectionQuery('featured');
  const trending = useCuratedCollectionQuery('trending');
  const popular = usePopularCountriesQuery();
  // Wait for history so recommendations aren't computed twice (empty, then real).
  const recommended = useRecommendationsQuery(recentlyViewed, { skip: !historyReady });

  const recent = useMemo(() => recentlyViewed.map(recentToSummary), [recentlyViewed]);

  return {
    name: user?.firstName || user?.username || null,
    featured: section(featured),
    trending: section(trending),
    popular: section(popular),
    recommended: { ...section(recommended), loading: recommended.isLoading || !historyReady },
    recent,
    clearRecent: () => void dispatch(clearRecentlyViewed()),
  };
}
