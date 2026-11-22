import { createEntityAdapter, createSlice, isAnyOf, isPending, isRejected, type PayloadAction } from '@reduxjs/toolkit';

import { type AppErrorKind } from '@/core/errors/AppError';
import { createAppAsyncThunk } from '@/core/store/hooks';
import { sessionExpired, signIn, signOut } from '@/features/auth/presentation/state/authSlice';
import { deleteActivity } from '@/features/itinerary/presentation/state/itinerarySlice';
import { deleteTrip } from '@/features/trips/presentation/state/tripsSlice';

import { type Photo, type PickedImage } from '../../domain/Photo';
import { type AttachPhotosInput, type RejectedImage } from '../../domain/usecases/photoUseCases';

export type PhotosLoadStatus = 'idle' | 'loading' | 'ready' | 'failed';

export interface PhotosTripLoad {
  readonly status: PhotosLoadStatus;
  readonly errorKind: AppErrorKind | null;
  readonly requestId: string | null;
}

export type PhotosLoad =
  { readonly ok: true; readonly photos: readonly Photo[] } | { readonly ok: false; readonly errorKind: AppErrorKind };

/** Serialisable result of an attach (actions must not carry `AppError` instances). */
export type PhotoAttachOutcome =
  | { readonly status: 'saved'; readonly photos: readonly Photo[]; readonly rejected: readonly RejectedImage[] }
  | { readonly status: 'invalid'; readonly rejected: readonly RejectedImage[] }
  | { readonly status: 'failed'; readonly errorKind: AppErrorKind };

export type PhotoDeleteOutcome =
  { readonly status: 'deleted'; readonly id: string } | { readonly status: 'failed'; readonly errorKind: AppErrorKind };

/** Images captured or picked and shown in Preview before they are attached: temporary URIs, never image data. */
export interface PendingPhotos {
  readonly tripId: string;
  readonly activityId: string | null;
  readonly images: readonly PickedImage[];
}

const photosAdapter = createEntityAdapter<Photo>();

/**
 * A copy of photo metadata for the UI, loaded per trip. SQLite stays the source of
 * truth and the images stay in app storage: only relative references are kept
 * here. The copy is dropped whenever the account changes, and results are accepted
 * only from the request recorded here, so a late one can't bring photos back.
 */
const initialState = photosAdapter.getInitialState({
  loadByTrip: {} as Record<string, PhotosTripLoad>,
  /** The change being written; further ones are refused, so a double tap attaches once. */
  changeRequestId: null as string | null,
  /** True once orphaned files were pruned this session. */
  pruned: false,
  pending: null as PendingPhotos | null,
});

export type PhotosState = typeof initialState;

const notChanging = {
  condition: (_: unknown, { getState }: { getState: () => { photos: PhotosState } }) =>
    getState().photos.changeRequestId === null,
};

export const loadTripPhotos = createAppAsyncThunk(
  'photos/loadTrip',
  async (tripId: string, { extra }): Promise<PhotosLoad> => {
    const result = await extra.getTripPhotos.execute(tripId);
    return result.ok ? { ok: true, photos: result.value } : { ok: false, errorKind: result.error.kind };
  },
  {
    // Signed out there is nothing to load; the next sign-in starts from `idle`.
    condition: (tripId, { getState, extra }) => {
      const status = getState().photos.loadByTrip[tripId]?.status ?? 'idle';
      return extra.tripOwnerProvider.currentOwnerId() !== null && (status === 'idle' || status === 'failed');
    },
  },
);

export const attachPhotos = createAppAsyncThunk(
  'photos/attach',
  async (input: AttachPhotosInput, { extra }): Promise<PhotoAttachOutcome> => {
    const outcome = await extra.attachPhotos.execute(input);
    return outcome.status === 'failed' ? { status: 'failed', errorKind: outcome.error.kind } : outcome;
  },
  notChanging,
);

export const deletePhoto = createAppAsyncThunk(
  'photos/delete',
  async (id: string, { extra }): Promise<PhotoDeleteOutcome> => {
    const result = await extra.deletePhoto.execute(id);
    return result.ok ? { status: 'deleted', id } : { status: 'failed', errorKind: result.error.kind };
  },
  notChanging,
);

/** Removes orphaned photo files once per session; failures are only logged, since nothing depends on it. */
export const prunePhotoFiles = createAppAsyncThunk(
  'photos/prune',
  async (_: void, { extra }): Promise<number> => {
    const result = await extra.prunePhotoFiles.execute();
    if (result.ok) return result.value;
    extra.logger.warn('Could not clean up photo files', { kind: result.error.kind });
    return 0;
  },
  { condition: (_, { getState }) => !getState().photos.pruned },
);

const removeWhere = (state: PhotosState, matches: (photo: Photo) => boolean) => {
  photosAdapter.removeMany(
    state,
    state.ids.filter((id) => {
      const photo = state.entities[id];
      return photo !== undefined && matches(photo);
    }),
  );
};

const photosSlice = createSlice({
  name: 'photos',
  initialState,
  reducers: {
    setPendingPhotos(state, { payload }: PayloadAction<PendingPhotos>) {
      state.pending = { ...payload, images: [...payload.images] };
    },
    removePendingImage(state, { payload }: PayloadAction<number>) {
      if (!state.pending) return;
      state.pending.images = state.pending.images.filter((_, index) => index !== payload);
    },
    clearPendingPhotos(state) {
      state.pending = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadTripPhotos.pending, (state, { meta }) => {
        state.loadByTrip[meta.arg] = { status: 'loading', errorKind: null, requestId: meta.requestId };
      })
      .addCase(loadTripPhotos.fulfilled, (state, { payload, meta }) => {
        if (state.loadByTrip[meta.arg]?.requestId !== meta.requestId) return;
        if (payload.ok) {
          removeWhere(state, (photo) => photo.tripId === meta.arg);
          photosAdapter.upsertMany(state, payload.photos);
          state.loadByTrip[meta.arg] = { status: 'ready', errorKind: null, requestId: null };
        } else {
          state.loadByTrip[meta.arg] = { status: 'failed', errorKind: payload.errorKind, requestId: null };
        }
      })
      // Use cases report failures as values; this only covers an unexpected throw.
      .addCase(loadTripPhotos.rejected, (state, { meta }) => {
        if (meta.condition || state.loadByTrip[meta.arg]?.requestId !== meta.requestId) return;
        state.loadByTrip[meta.arg] = { status: 'failed', errorKind: 'unknown', requestId: null };
      })
      .addCase(attachPhotos.fulfilled, (state, { payload, meta }) => {
        if (state.changeRequestId !== meta.requestId) return;
        state.changeRequestId = null;
        // A trip that isn't held loads afresh (with these photos) when it is next shown.
        if (payload.status !== 'saved' || state.loadByTrip[meta.arg.tripId] === undefined) return;
        // SQLite lists photos saved together last-inserted first; mirror that order.
        photosAdapter.upsertMany(state, [...payload.photos].reverse());
      })
      .addCase(deletePhoto.fulfilled, (state, { payload, meta }) => {
        if (state.changeRequestId !== meta.requestId) return;
        state.changeRequestId = null;
        if (payload.status === 'deleted') photosAdapter.removeOne(state, payload.id);
      })
      .addCase(prunePhotoFiles.pending, (state) => {
        state.pruned = true;
      })
      // The cascade in SQLite already removed their rows.
      .addCase(deleteTrip.fulfilled, (state, { payload }) => {
        if (payload.status !== 'deleted') return;
        removeWhere(state, (photo) => photo.tripId === payload.id);
        delete state.loadByTrip[payload.id];
        if (state.pending?.tripId === payload.id) state.pending = null;
      })
      .addCase(deleteActivity.fulfilled, (state, { payload }) => {
        if (payload.status !== 'deleted') return;
        removeWhere(state, (photo) => photo.activityId === payload.id);
        if (state.pending?.activityId === payload.id) state.pending = null;
      })
      .addMatcher(isPending(attachPhotos, deletePhoto), (state, { meta }) => {
        state.changeRequestId = meta.requestId;
      })
      // A dispatch refused by `condition` sends no action, so this is always the change that was running.
      .addMatcher(isRejected(attachPhotos, deletePhoto), (state, { meta }) => {
        if (state.changeRequestId === meta.requestId) state.changeRequestId = null;
      })
      // Sign-in is included so nothing can carry over even if an earlier session ended some other way.
      .addMatcher(isAnyOf(signOut.fulfilled, signOut.rejected, sessionExpired, signIn.fulfilled), () => initialState);
  },
});

export const { setPendingPhotos, removePendingImage, clearPendingPhotos } = photosSlice.actions;
export const photosReducer = photosSlice.reducer;
export const photosSelectors = photosAdapter.getSelectors();
