import { useCallback, useEffect, useMemo } from 'react';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { type AppErrorKind } from '@/core/errors/AppError';
import { useAppDispatch, useAppSelector } from '@/core/store/hooks';
import { type Activity } from '@/features/itinerary/domain/Activity';
import { useItinerary } from '@/features/itinerary/presentation/hooks/useItinerary';

import { type Photo } from '../../domain/Photo';
import { loadTripPhotos, prunePhotoFiles } from '../state/photosSlice';
import {
  selectActivityPhotos,
  selectPhotosErrorKind,
  selectPhotosLoadStatus,
  selectTripPhotos,
} from '../state/selectors';

/** A photo ready to show: where its image is, and which activity it belongs to. */
export interface PhotoItem {
  readonly photo: Photo;
  /** `null` when the file is gone or the reference is invalid: show the "unavailable" placeholder. */
  readonly displayUri: string | null;
  /** The activity's title for an activity photo, `null` for a photo of the trip itself. */
  readonly activityTitle: string | null;
}

/** What a photo screen shows instead of its content. */
export type PhotosScreenState =
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly errorKind: AppErrorKind | null }
  | { readonly kind: 'tripNotFound' }
  | { readonly kind: 'activityNotFound' }
  | { readonly kind: 'ready' };

/** File existence per reference and store, so each photo is stat-ed once rather than on every recompute. */
const existenceCaches = new WeakMap<object, Map<string, boolean>>();

function existenceCache(store: object): Map<string, boolean> {
  let cache = existenceCaches.get(store);
  if (!cache) {
    cache = new Map();
    existenceCaches.set(store, cache);
  }
  return cache;
}

const NO_PHOTOS: readonly Photo[] = [];

/**
 * View model behind the trip and activity galleries: the trip's photos (loaded once
 * per session), resolved against app storage at render time, plus the trip and its
 * activities for labels and "not found" states. Orphaned files are pruned once per session.
 */
export function usePhotoGallery(tripId: string, activityId: string | null) {
  const dispatch = useAppDispatch();
  const { photoFileStore } = useDependencies();
  const { supported } = photoFileStore;
  const itinerary = useItinerary(tripId);
  const status = useAppSelector((state) => selectPhotosLoadStatus(state, tripId));
  const loadError = useAppSelector((state) => selectPhotosErrorKind(state, tripId));

  useEffect(() => {
    // Only the first caller loads: the thunk's condition skips it once loading has started.
    if (supported && status === 'idle') void dispatch(loadTripPhotos(tripId));
  }, [dispatch, status, supported, tripId]);

  useEffect(() => {
    if (supported) void dispatch(prunePhotoFiles());
  }, [dispatch, supported]);

  const { retry: retryItinerary } = itinerary;
  const retry = useCallback(() => {
    retryItinerary();
    void dispatch(loadTripPhotos(tripId));
  }, [dispatch, retryItinerary, tripId]);

  const tripPhotos = useAppSelector((state) => selectTripPhotos(state, tripId));
  const activityPhotos = useAppSelector((state) =>
    activityId === null ? NO_PHOTOS : selectActivityPhotos(state, activityId),
  );
  const photos = activityId === null ? tripPhotos : activityPhotos;

  const activities = itinerary.activities;
  const activity: Activity | undefined = useMemo(
    () => (activityId === null ? undefined : activities.find(({ id }) => id === activityId)),
    [activities, activityId],
  );

  const items = useMemo((): readonly PhotoItem[] => {
    const existence = existenceCache(photoFileStore);
    const fileExists = (reference: string): boolean => {
      let found = existence.get(reference);
      if (found === undefined) {
        found = photoFileStore.exists(reference);
        existence.set(reference, found);
      }
      return found;
    };
    const titles = new Map(activities.map(({ id, title }) => [id, title]));
    return photos
      .filter((photo) => photo.tripId === tripId)
      .map((photo) => ({
        photo,
        displayUri: fileExists(photo.reference) ? photoFileStore.displayUri(photo.reference) : null,
        activityTitle: photo.activityId === null ? null : (titles.get(photo.activityId) ?? null),
      }));
  }, [activities, photoFileStore, photos, tripId]);

  const { screen: itineraryScreen } = itinerary;
  const screen = useMemo((): PhotosScreenState => {
    if (!supported) return { kind: 'unsupported' };
    if (itineraryScreen.kind !== 'ready') return itineraryScreen;
    if (activityId !== null && !activity) return { kind: 'activityNotFound' };
    if (status === 'failed') {
      return loadError === 'notFound' ? { kind: 'tripNotFound' } : { kind: 'failed', errorKind: loadError };
    }
    return status === 'ready' ? { kind: 'ready' } : { kind: 'loading' };
  }, [supported, itineraryScreen, activityId, activity, status, loadError]);

  return { screen, items, trip: itinerary.trip, activity, retry };
}

/** Every photo of the trip, its activities' included, newest first. */
export function useTripPhotos(tripId: string) {
  return usePhotoGallery(tripId, null);
}

/** The photos of one of the trip's activities, newest first. */
export function useActivityPhotos(tripId: string, activityId: string) {
  return usePhotoGallery(tripId, activityId);
}

/** One photo of the trip; `item` is undefined while loading or when it doesn't exist (in this trip or activity). */
export function usePhoto(tripId: string, photoId: string, activityId: string | null) {
  const gallery = usePhotoGallery(tripId, activityId);
  const item = gallery.items.find(({ photo }) => photo.id === photoId);
  return { ...gallery, item };
}
