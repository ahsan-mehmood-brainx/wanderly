import { useEffect, useRef } from 'react';

import { useAppDispatch } from '@/core/store/hooks';

import { queryErrorKind, useDestinationDetailsQuery } from '../state/discoverApi';
import { recordDestinationView } from '../state/discoverSlice';

/**
 * Loads a destination (cached by RTK Query for `CACHE_SECONDS.details`, so
 * going back and forth is instant) and records it in "recently viewed" once per
 * visit, after it has loaded.
 */
export function useDestinationDetails(id: string) {
  const dispatch = useAppDispatch();
  const query = useDestinationDetailsQuery(id);
  const recorded = useRef<string | null>(null);
  const details = query.currentData;

  useEffect(() => {
    if (!details || recorded.current === details.id) return;
    recorded.current = details.id;
    void dispatch(recordDestinationView(details));
  }, [details, dispatch]);

  return {
    details,
    loading: query.isLoading || (query.isFetching && !details),
    errorKind: details ? null : queryErrorKind(query.error),
    refreshing: query.isFetching && details !== undefined,
    retry: () => void query.refetch(),
  };
}
