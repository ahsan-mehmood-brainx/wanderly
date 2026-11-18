import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppDispatch, useAppSelector } from '@/core/store/hooks';

import { hasActiveFilters, NO_FILTERS, type SearchFilters } from '../../domain/SearchFilters';
import { normalizeQuery, normalizeText } from '../../domain/searchMatching';
import { queryErrorKind, useSearchDestinationsQuery } from '../state/discoverApi';
import { clearSearchHistory, forgetSearch, loadDiscoveryHistory, rememberSearch } from '../state/discoverSlice';
import { selectSearchHistory } from '../state/selectors';
import { useDebouncedValue } from './useDebouncedValue';

export interface DestinationSearchOptions {
  readonly initialQuery?: string;
  readonly initialFilters?: SearchFilters;
  /** Overridable for tests. */
  readonly debounceMs?: number;
}

/**
 * View model for the search screen.
 *
 * Typing is debounced before a search is issued; RTK Query caches each
 * (query, filters) pair and ignores responses for superseded arguments, so
 * results never flash back to an older query. While a new search runs, the
 * previous results stay visible with a busy indicator instead of blanking.
 *
 * A query is added to recent searches when the user submits it or opens a result,
 * not on every keystroke.
 */
export function useDestinationSearch({
  initialQuery = '',
  initialFilters = NO_FILTERS,
  debounceMs,
}: DestinationSearchOptions = {}) {
  const dispatch = useAppDispatch();
  const history = useAppSelector(selectSearchHistory);
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<SearchFilters>(initialFilters);
  const [debouncedQuery, debouncing] = useDebouncedValue(query, debounceMs);

  useEffect(() => {
    void dispatch(loadDiscoveryHistory());
  }, [dispatch]);

  const args = useMemo(() => ({ query: normalizeQuery(debouncedQuery), filters }), [debouncedQuery, filters]);
  const idle = !normalizeText(args.query) && !hasActiveFilters(filters);
  const typedNothing = !normalizeText(query) && !hasActiveFilters(filters);

  const search = useSearchDestinationsQuery(args, { skip: idle });
  // `data` is the last successful result, possibly for an older query: kept on screen while the next one loads.
  const outcome = idle ? undefined : search.data;
  // `isError` describes the current arguments only, so an old failure never sticks to a new query.
  const errorKind = !idle && search.isError && !search.isFetching ? queryErrorKind(search.error) : null;

  const remember = useCallback(() => {
    if (normalizeText(query)) void dispatch(rememberSearch(query));
  }, [dispatch, query]);

  return {
    query,
    setQuery,
    filters,
    setFilters,
    clearQuery: () => setQuery(''),
    clearFilters: () => setFilters(NO_FILTERS),
    /** Nothing typed and no filters: show recent searches instead of results. */
    idle: typedNothing,
    outcome,
    /** A search for the current input is pending (debounce or request). */
    busy: !typedNothing && (debouncing || search.isFetching),
    /** First load for this input, with nothing to show yet. */
    loading: !typedNothing && outcome === undefined && errorKind === null,
    errorKind: typedNothing ? null : errorKind,
    retry: () => void search.refetch(),
    history,
    remember,
    selectHistoryEntry: (entry: string) => {
      setQuery(entry);
      void dispatch(rememberSearch(entry));
    },
    forgetHistoryEntry: (entry: string) => void dispatch(forgetSearch(entry)),
    clearHistory: () => void dispatch(clearSearchHistory()),
  };
}
