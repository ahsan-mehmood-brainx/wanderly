import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { useAppDispatch } from '@/core/store/hooks';
import { routes } from '@/shared/navigation/routes';

import { allowsAccess } from '../../domain/usecases/photoUseCases';
import { setPendingPhotos } from '../state/photosSlice';

/** `options`: Take photo / Choose from library; `libraryPermission`: why library access is needed. */
export type AddPhotosStep = 'closed' | 'options' | 'libraryPermission';

interface AddPhotosTarget {
  readonly tripId: string;
  readonly activityId: string | null;
}

/**
 * The "Add photo" flow of a gallery. The camera screen asks for its own permission;
 * the library is only opened while access is allowed, after explaining why when it isn't.
 * Picked images go to Preview as pending photos (URIs only) before anything is saved.
 */
export function useAddPhotos({ tripId, activityId }: AddPhotosTarget) {
  const dispatch = useAppDispatch();
  const { getMediaPermission, pickLibraryImages } = useDependencies();
  const [step, setStep] = useState<AddPhotosStep>('closed');
  const [pickFailed, setPickFailed] = useState(false);
  // A double tap must not open the picker twice.
  const busy = useRef(false);

  const pick = useCallback(async () => {
    const result = await pickLibraryImages.execute();
    if (!result.ok) {
      if (result.error.kind === 'forbidden') setStep('libraryPermission');
      else setPickFailed(true);
      return;
    }
    const images = result.value;
    if (images === null || images.length === 0) return;
    dispatch(setPendingPhotos({ tripId, activityId, images }));
    router.push(routes.photoPreview(tripId, activityId));
  }, [activityId, dispatch, pickLibraryImages, tripId]);

  const runOnce = useCallback((task: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    void task().finally(() => {
      busy.current = false;
    });
  }, []);

  const chooseFromLibrary = useCallback(() => {
    runOnce(async () => {
      setPickFailed(false);
      const permission = await getMediaPermission.execute('library');
      if (!allowsAccess(permission)) {
        setStep('libraryPermission');
        return;
      }
      setStep('closed');
      await pick();
    });
  }, [getMediaPermission, pick, runOnce]);

  /** Called once library access has just been allowed from the explanation. */
  const continueWithLibrary = useCallback(() => {
    runOnce(async () => {
      setStep('closed');
      await pick();
    });
  }, [pick, runOnce]);

  const takePhoto = useCallback(() => {
    setStep('closed');
    router.push(routes.photoCamera(tripId, activityId));
  }, [activityId, tripId]);

  const toggle = useCallback(() => setStep((current) => (current === 'closed' ? 'options' : 'closed')), []);
  const close = useCallback(() => setStep('closed'), []);
  const dismissPickFailed = useCallback(() => setPickFailed(false), []);

  return { step, toggle, close, takePhoto, chooseFromLibrary, continueWithLibrary, pickFailed, dismissPickFailed };
}
