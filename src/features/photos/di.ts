import { Platform } from 'react-native';

import { type CoreDependencies } from '@/core/di/CoreDependencies';
import { type Factories } from '@/core/di/createContainer';
import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';
import { type ItineraryDependencies } from '@/features/itinerary/di';
import { type TripsDependencies } from '@/features/trips/di';

import { ExpoImageProcessor } from './data/ExpoImageProcessor';
import { ExpoMediaPermissionService } from './data/ExpoMediaPermissionService';
import { ExpoPhotoLibraryPicker } from './data/ExpoPhotoLibraryPicker';
import { FileSystemPhotoStore, UnsupportedPhotoStore } from './data/FileSystemPhotoStore';
import { LocalPhotoRepository } from './data/LocalPhotoRepository';
import { type Photo, type PickedImage } from './domain/Photo';
import {
  type ImageProcessor,
  type MediaKind,
  type MediaPermission,
  type MediaPermissionService,
  type PhotoFileStore,
  type PhotoLibraryPicker,
  type PhotoRepository,
} from './domain/repositories';
import {
  type ActivityPhotosInput,
  AttachPhotos,
  type AttachPhotosInput,
  type AttachPhotosOutcome,
  DeletePhoto,
  GetActivityPhotos,
  GetMediaPermission,
  GetTripPhotos,
  PickLibraryImages,
  PrunePhotoFiles,
  RequestMediaPermission,
} from './domain/usecases/photoUseCases';

export interface PhotosDependencies {
  readonly photoRepository: PhotoRepository;
  readonly photoFileStore: PhotoFileStore;
  readonly imageProcessor: ImageProcessor;
  readonly mediaPermissionService: MediaPermissionService;
  readonly photoLibraryPicker: PhotoLibraryPicker;
  readonly getTripPhotos: UseCase<string, Result<readonly Photo[], AppError>>;
  readonly getActivityPhotos: UseCase<ActivityPhotosInput, Result<readonly Photo[], AppError>>;
  readonly attachPhotos: UseCase<AttachPhotosInput, AttachPhotosOutcome>;
  readonly deletePhoto: UseCase<string, Result<void, AppError>>;
  readonly prunePhotoFiles: UseCase<void, Result<number, AppError>>;
  readonly getMediaPermission: UseCase<MediaKind, MediaPermission>;
  readonly requestMediaPermission: UseCase<MediaKind, MediaPermission>;
  readonly pickLibraryImages: UseCase<void, Result<readonly PickedImage[] | null, AppError>>;
}

export const photosFactories: Factories<
  PhotosDependencies,
  CoreDependencies &
    Pick<TripsDependencies, 'tripRepository' | 'tripOwnerProvider'> &
    Pick<ItineraryDependencies, 'activityRepository'> &
    PhotosDependencies
> = {
  photoRepository: (c) => new LocalPhotoRepository(c.database, c.logger.child({ scope: 'photos' })),
  photoFileStore: (c) =>
    Platform.OS === 'web'
      ? new UnsupportedPhotoStore()
      : new FileSystemPhotoStore(c.idGenerator, c.logger.child({ scope: 'photoFiles' })),
  imageProcessor: (c) => new ExpoImageProcessor(c.logger.child({ scope: 'imageProcessor' })),
  mediaPermissionService: (c) => new ExpoMediaPermissionService(c.logger.child({ scope: 'mediaPermissions' })),
  photoLibraryPicker: (c) => new ExpoPhotoLibraryPicker(c.logger.child({ scope: 'photoLibrary' })),
  getTripPhotos: (c) => new GetTripPhotos(c.photoRepository, c.tripRepository, c.tripOwnerProvider),
  getActivityPhotos: (c) => new GetActivityPhotos(c.photoRepository, c.activityRepository, c.tripOwnerProvider),
  attachPhotos: (c) =>
    new AttachPhotos(
      c.photoRepository,
      c.tripRepository,
      c.activityRepository,
      c.tripOwnerProvider,
      c.photoFileStore,
      c.imageProcessor,
      c.clock,
      c.idGenerator,
    ),
  deletePhoto: (c) => new DeletePhoto(c.photoRepository, c.tripOwnerProvider, c.photoFileStore),
  prunePhotoFiles: (c) => new PrunePhotoFiles(c.photoRepository, c.photoFileStore, c.clock),
  getMediaPermission: (c) => new GetMediaPermission(c.mediaPermissionService),
  requestMediaPermission: (c) => new RequestMediaPermission(c.mediaPermissionService),
  pickLibraryImages: (c) => new PickLibraryImages(c.photoLibraryPicker, c.mediaPermissionService),
};
