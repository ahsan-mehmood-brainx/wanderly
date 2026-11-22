import { createSelector } from '@reduxjs/toolkit';

import { type AppErrorKind } from '@/core/errors/AppError';
import { type RootState } from '@/core/store/store';

import { type Photo } from '../../domain/Photo';
import { type PendingPhotos, type PhotosLoadStatus, photosSelectors } from './photosSlice';

const selectAllPhotos = (state: RootState) => photosSelectors.selectAll(state.photos);

/** Stable, so photos saved together keep the order SQLite gave them. */
const newestFirst = (photos: readonly Photo[]): readonly Photo[] =>
  [...photos].sort((a, b) => b.createdAt - a.createdAt);

/** The trip's photos (its activities' included), newest first. */
export const selectTripPhotos = createSelector(
  [selectAllPhotos, (_: RootState, tripId: string) => tripId],
  (photos, tripId): readonly Photo[] => newestFirst(photos.filter((photo) => photo.tripId === tripId)),
);

/** The activity's photos, newest first. */
export const selectActivityPhotos = createSelector(
  [selectAllPhotos, (_: RootState, activityId: string) => activityId],
  (photos, activityId): readonly Photo[] => newestFirst(photos.filter((photo) => photo.activityId === activityId)),
);

export const selectPhotoById = (state: RootState, id: string): Photo | undefined =>
  photosSelectors.selectById(state.photos, id);

export const selectPhotosLoadStatus = (state: RootState, tripId: string): PhotosLoadStatus =>
  state.photos.loadByTrip[tripId]?.status ?? 'idle';

export const selectPhotosErrorKind = (state: RootState, tripId: string): AppErrorKind | null =>
  state.photos.loadByTrip[tripId]?.errorKind ?? null;

export const selectPhotosSaving = (state: RootState): boolean => state.photos.changeRequestId !== null;

export const selectPendingPhotos = (state: RootState): PendingPhotos | null => state.photos.pending;
