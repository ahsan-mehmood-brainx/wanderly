import { useMemo } from 'react';

import { useAppSelector } from '@/core/store/hooks';
import { useFavoritesLoad } from '@/features/favorites/presentation/hooks/useFavorites';
import { selectAllFavorites } from '@/features/favorites/presentation/state/selectors';
import { useTrips } from '@/features/trips/presentation/hooks/useTrips';

import { summarizeTravelStats, type TravelStats } from '../../domain/travelStats';

/** A number once its source has loaded, `loading` before, `unavailable` if it couldn't load. */
export type StatValue = number | 'loading' | 'unavailable';

export type TravelStatValues = Readonly<Record<keyof TravelStats, StatValue>>;

function statValue(value: number, loading: boolean, failed: boolean): StatValue {
  if (failed) return 'unavailable';
  return loading ? 'loading' : value;
}

/** Travel stats from the trips and saved places of the signed-in account. Each source can fail on its own. */
export function useTravelStats(): TravelStatValues {
  const trips = useTrips();
  const favoritesLoad = useFavoritesLoad();
  const favoritesCount = useAppSelector(selectAllFavorites).length;
  const { groups, today } = trips;

  const stats = useMemo(
    () => summarizeTravelStats(Object.values(groups).flat(), favoritesCount, today),
    [groups, favoritesCount, today],
  );
  const favoritesLoading = favoritesLoad.status === 'idle' || favoritesLoad.status === 'loading';
  const favoritesFailed = favoritesLoad.status === 'failed';

  return {
    totalTrips: statValue(stats.totalTrips, trips.loading, trips.failed),
    completedTrips: statValue(stats.completedTrips, trips.loading, trips.failed),
    savedPlaces: statValue(stats.savedPlaces, favoritesLoading, favoritesFailed),
  };
}
