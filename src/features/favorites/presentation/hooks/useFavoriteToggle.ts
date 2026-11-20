import { useCallback, useEffect, useRef, useState } from 'react';

import { type AppErrorKind } from '@/core/errors/AppError';
import { useAppDispatch, useAppSelector } from '@/core/store/hooks';

import { type FavoriteTarget } from '../../domain/Favorite';
import {
  type FavoriteRemoveOutcome,
  type FavoriteSaveOutcome,
  loadFavorites,
  removeFavorite,
  saveFavorite,
} from '../state/favoritesSlice';
import { selectFavoriteByTargetId, selectFavoritesLoadStatus, selectFavoritesSaving } from '../state/selectors';

/**
 * Save/unsave for a detail screen. `target` is `null` while there is nothing that
 * can be saved (still loading, or a hotel). Loads the favorites the first time,
 * so a place saved earlier shows as saved.
 */
export function useFavoriteToggle(target: FavoriteTarget | null) {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectFavoritesLoadStatus);
  const targetId = target?.targetId ?? null;
  const favorite = useAppSelector((state) =>
    targetId === null ? undefined : selectFavoriteByTargetId(state, targetId),
  );
  const saving = useAppSelector(selectFavoritesSaving);
  const [failed, setFailed] = useState<{ readonly targetId: string; readonly errorKind: AppErrorKind } | null>(null);

  // The target this hook last loaded for. A failed load is retried once per mount
  // or target, so a load that keeps failing can't loop.
  const loadRequestedFor = useRef<string | null>(null);
  useEffect(() => {
    if (targetId === null) return;
    if (status === 'idle' || (status === 'failed' && loadRequestedFor.current !== targetId)) {
      loadRequestedFor.current = targetId;
      void dispatch(loadFavorites());
    }
  }, [dispatch, status, targetId]);

  const toggle = useCallback(async () => {
    if (target === null) return;
    setFailed(null);
    // A refused dispatch (another change is running) or a throw has no outcome to report.
    let outcome: FavoriteSaveOutcome | FavoriteRemoveOutcome | null = null;
    if (favorite) {
      const action = await dispatch(removeFavorite(favorite.id));
      if (removeFavorite.fulfilled.match(action)) outcome = action.payload;
    } else {
      const action = await dispatch(saveFavorite(target));
      if (saveFavorite.fulfilled.match(action)) outcome = action.payload;
    }
    if (outcome?.status === 'failed') setFailed({ targetId: target.targetId, errorKind: outcome.errorKind });
  }, [dispatch, favorite, target]);

  return {
    saved: favorite !== undefined,
    saving,
    /** The favorites couldn't be loaded, so `saved` may be wrong. Saving still keeps one record. */
    savedStateUnknown: targetId !== null && status === 'failed',
    toggle,
    errorKind: failed !== null && failed.targetId === targetId ? failed.errorKind : null,
  };
}
