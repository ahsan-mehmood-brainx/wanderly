import { createEntityAdapter, createSlice, isAnyOf, isPending, isRejected } from '@reduxjs/toolkit';

import { type AppErrorKind } from '@/core/errors/AppError';
import { createAppAsyncThunk } from '@/core/store/hooks';
import { sessionExpired, signIn, signOut } from '@/features/auth/presentation/state/authSlice';

import { type Collection, type CollectionMembership, compareCollections } from '../../domain/Collection';
import { compareFavorites, type Favorite, type FavoriteTarget } from '../../domain/Favorite';
import { type FavoritesSnapshot } from '../../domain/repositories';
import {
  type CollectionValidationError,
  type RemoveFromCollectionInput,
  type RenameCollectionInput,
  type SaveCollectionOutcome,
  type SetFavoriteCollectionsInput,
} from '../../domain/usecases/favoriteUseCases';

/** Serialisable results of changes (actions must not carry `AppError` instances). */
export type FavoriteSaveOutcome =
  | { readonly status: 'saved'; readonly favorite: Favorite }
  | { readonly status: 'failed'; readonly errorKind: AppErrorKind };

export type FavoriteRemoveOutcome =
  { readonly status: 'removed'; readonly id: string } | { readonly status: 'failed'; readonly errorKind: AppErrorKind };

export type CollectionChangeOutcome =
  | { readonly status: 'saved'; readonly collection: Collection }
  | { readonly status: 'invalid'; readonly error: CollectionValidationError }
  | { readonly status: 'failed'; readonly errorKind: AppErrorKind };

export type CollectionDeleteOutcome =
  { readonly status: 'deleted'; readonly id: string } | { readonly status: 'failed'; readonly errorKind: AppErrorKind };

export type MembershipChangeOutcome =
  | { readonly status: 'saved'; readonly favoriteId: string; readonly memberships: readonly CollectionMembership[] }
  | { readonly status: 'failed'; readonly errorKind: AppErrorKind };

export type MembershipRemoveOutcome =
  | { readonly status: 'removed'; readonly collectionId: string; readonly favoriteId: string }
  | { readonly status: 'failed'; readonly errorKind: AppErrorKind };

export type FavoritesLoadStatus = 'idle' | 'loading' | 'ready' | 'failed';

type FavoritesLoad =
  | { readonly ok: true; readonly snapshot: FavoritesSnapshot }
  | { readonly ok: false; readonly errorKind: AppErrorKind };

const favoritesAdapter = createEntityAdapter<Favorite>({ sortComparer: compareFavorites });
const collectionsAdapter = createEntityAdapter<Collection>({ sortComparer: compareCollections });

/**
 * A copy of the signed-in account's saved places and collections for the UI.
 * SQLite stays the source of truth: each change is saved there first and mirrored
 * here only after it succeeded.
 *
 * The copy is dropped whenever the account changes. Results are accepted only from
 * the request recorded here, so one that finishes after sign-out can't bring them back.
 */
const initialState = {
  favorites: favoritesAdapter.getInitialState(),
  collections: collectionsAdapter.getInitialState(),
  memberships: [] as CollectionMembership[],
  status: 'idle' as FavoritesLoadStatus,
  errorKind: null as AppErrorKind | null,
  requestId: null as string | null,
  /** The change being written; further ones are refused, so a double tap saves once. */
  changeRequestId: null as string | null,
  /**
   * A change was saved while the running load was reading, so its snapshot may not
   * include it. That snapshot is dropped and the status goes back to `idle`, which
   * makes the screens load again.
   */
  changedWhileLoading: false,
};

export type FavoritesState = typeof initialState;

const notSaving = {
  condition: (_: unknown, { getState }: { getState: () => { favorites: FavoritesState } }) =>
    getState().favorites.changeRequestId === null,
};

const toCollectionOutcome = (outcome: SaveCollectionOutcome): CollectionChangeOutcome =>
  outcome.status === 'failed' ? { status: 'failed', errorKind: outcome.error.kind } : outcome;

export const loadFavorites = createAppAsyncThunk(
  'favorites/load',
  async (_: void, { extra }): Promise<FavoritesLoad> => {
    const result = await extra.getFavorites.execute();
    return result.ok ? { ok: true, snapshot: result.value } : { ok: false, errorKind: result.error.kind };
  },
  {
    // Signed out there is nothing to load; the next sign-in starts from `idle`.
    condition: (_, { getState, extra }) => {
      const { status } = getState().favorites;
      return extra.tripOwnerProvider.currentOwnerId() !== null && (status === 'idle' || status === 'failed');
    },
  },
);

export const saveFavorite = createAppAsyncThunk(
  'favorites/save',
  async (target: FavoriteTarget, { extra }): Promise<FavoriteSaveOutcome> => {
    const result = await extra.saveFavorite.execute(target);
    return result.ok ? { status: 'saved', favorite: result.value } : { status: 'failed', errorKind: result.error.kind };
  },
  notSaving,
);

export const removeFavorite = createAppAsyncThunk(
  'favorites/remove',
  async (favoriteId: string, { extra }): Promise<FavoriteRemoveOutcome> => {
    const result = await extra.removeFavorite.execute(favoriteId);
    return result.ok ? { status: 'removed', id: favoriteId } : { status: 'failed', errorKind: result.error.kind };
  },
  notSaving,
);

export const createCollection = createAppAsyncThunk(
  'favorites/createCollection',
  async (name: string, { extra }): Promise<CollectionChangeOutcome> =>
    toCollectionOutcome(await extra.createCollection.execute(name)),
  notSaving,
);

export const renameCollection = createAppAsyncThunk(
  'favorites/renameCollection',
  async (input: RenameCollectionInput, { extra }): Promise<CollectionChangeOutcome> =>
    toCollectionOutcome(await extra.renameCollection.execute(input)),
  notSaving,
);

export const deleteCollection = createAppAsyncThunk(
  'favorites/deleteCollection',
  async (id: string, { extra }): Promise<CollectionDeleteOutcome> => {
    const result = await extra.deleteCollection.execute(id);
    return result.ok ? { status: 'deleted', id } : { status: 'failed', errorKind: result.error.kind };
  },
  notSaving,
);

export const setFavoriteCollections = createAppAsyncThunk(
  'favorites/setCollections',
  async (input: SetFavoriteCollectionsInput, { extra }): Promise<MembershipChangeOutcome> => {
    const result = await extra.setFavoriteCollections.execute(input);
    return result.ok
      ? { status: 'saved', favoriteId: input.favoriteId, memberships: result.value }
      : { status: 'failed', errorKind: result.error.kind };
  },
  notSaving,
);

export const removeFromCollection = createAppAsyncThunk(
  'favorites/removeFromCollection',
  async (input: RemoveFromCollectionInput, { extra }): Promise<MembershipRemoveOutcome> => {
    const result = await extra.removeFromCollection.execute(input);
    return result.ok ? { status: 'removed', ...input } : { status: 'failed', errorKind: result.error.kind };
  },
  notSaving,
);

const changeThunks = [
  saveFavorite,
  removeFavorite,
  createCollection,
  renameCollection,
  deleteCollection,
  setFavoriteCollections,
  removeFromCollection,
] as const;

/** Whether this fulfilled change is the one still running; releases the lock if so. */
function finishChange(state: FavoritesState, requestId: string): boolean {
  if (state.changeRequestId !== requestId) return false;
  state.changeRequestId = null;
  return true;
}

/** Records a change that was saved, so a load reading at the same time is not trusted. */
function changeSaved(state: FavoritesState) {
  if (state.requestId !== null) state.changedWhileLoading = true;
}

const favoritesSlice = createSlice({
  name: 'favorites',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadFavorites.pending, (state, { meta }) => {
        state.status = 'loading';
        state.errorKind = null;
        state.requestId = meta.requestId;
        state.changedWhileLoading = false;
      })
      .addCase(loadFavorites.fulfilled, (state, { payload, meta }) => {
        if (state.requestId !== meta.requestId) return;
        state.requestId = null;
        if (payload.ok && state.changedWhileLoading) {
          // The change is already mirrored here; read again instead of overwriting it with an older snapshot.
          state.changedWhileLoading = false;
          state.status = 'idle';
        } else if (payload.ok) {
          favoritesAdapter.setAll(state.favorites, payload.snapshot.favorites);
          collectionsAdapter.setAll(state.collections, payload.snapshot.collections);
          state.memberships = [...payload.snapshot.memberships];
          state.status = 'ready';
        } else {
          state.status = 'failed';
          state.errorKind = payload.errorKind;
        }
      })
      // Use cases report failures as values; this only covers an unexpected throw.
      .addCase(loadFavorites.rejected, (state, { meta }) => {
        if (meta.condition || state.requestId !== meta.requestId) return;
        state.requestId = null;
        state.changedWhileLoading = false;
        state.status = 'failed';
        state.errorKind = 'unknown';
      })
      .addCase(saveFavorite.fulfilled, (state, { payload, meta }) => {
        if (!finishChange(state, meta.requestId) || payload.status !== 'saved') return;
        changeSaved(state);
        favoritesAdapter.upsertOne(state.favorites, payload.favorite);
      })
      .addCase(removeFavorite.fulfilled, (state, { payload, meta }) => {
        if (!finishChange(state, meta.requestId) || payload.status !== 'removed') return;
        changeSaved(state);
        favoritesAdapter.removeOne(state.favorites, payload.id);
        state.memberships = state.memberships.filter((item) => item.favoriteId !== payload.id);
      })
      .addCase(deleteCollection.fulfilled, (state, { payload, meta }) => {
        if (!finishChange(state, meta.requestId) || payload.status !== 'deleted') return;
        changeSaved(state);
        collectionsAdapter.removeOne(state.collections, payload.id);
        state.memberships = state.memberships.filter((item) => item.collectionId !== payload.id);
      })
      .addCase(setFavoriteCollections.fulfilled, (state, { payload, meta }) => {
        if (!finishChange(state, meta.requestId) || payload.status !== 'saved') return;
        changeSaved(state);
        state.memberships = [
          ...state.memberships.filter((item) => item.favoriteId !== payload.favoriteId),
          ...payload.memberships,
        ];
      })
      .addCase(removeFromCollection.fulfilled, (state, { payload, meta }) => {
        if (!finishChange(state, meta.requestId) || payload.status !== 'removed') return;
        changeSaved(state);
        state.memberships = state.memberships.filter(
          (item) => !(item.collectionId === payload.collectionId && item.favoriteId === payload.favoriteId),
        );
      })
      .addMatcher(isAnyOf(createCollection.fulfilled, renameCollection.fulfilled), (state, { payload, meta }) => {
        if (!finishChange(state, meta.requestId) || payload.status !== 'saved') return;
        changeSaved(state);
        collectionsAdapter.upsertOne(state.collections, payload.collection);
      })
      .addMatcher(isPending(...changeThunks), (state, { meta }) => {
        state.changeRequestId = meta.requestId;
      })
      // A dispatch refused by `condition` sends no action, so this is always the change that was running.
      .addMatcher(isRejected(...changeThunks), (state, { meta }) => {
        if (state.changeRequestId === meta.requestId) state.changeRequestId = null;
      })
      // Sign-in is included so nothing can carry over even if an earlier session ended some other way.
      .addMatcher(isAnyOf(signOut.fulfilled, signOut.rejected, sessionExpired, signIn.fulfilled), () => initialState);
  },
});

export const favoritesReducer = favoritesSlice.reducer;
export const favoritesSelectors = favoritesAdapter.getSelectors();
export const collectionsSelectors = collectionsAdapter.getSelectors();
