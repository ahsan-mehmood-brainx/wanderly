import { Platform } from 'react-native';

import { type CoreDependencies } from '@/core/di/CoreDependencies';
import { type Factories } from '@/core/di/createContainer';
import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';
import { type TripsDependencies } from '@/features/trips/di';

import { FileSystemProfilePhotoStore, UnsupportedProfilePhotoStore } from './data/FileSystemProfilePhotoStore';
import { StorageLocalProfileRepository } from './data/StorageLocalProfileRepository';
import { type LocalProfile } from './domain/LocalProfile';
import { type LocalProfileInput } from './domain/profileValidation';
import { type LocalProfileRepository, type ProfilePhotoStore } from './domain/repositories';
import {
  GetLocalProfile,
  PickProfilePhoto,
  SaveLocalProfile,
  type SaveProfileOutcome,
} from './domain/usecases/profileUseCases';

export interface ProfileDependencies {
  readonly localProfileRepository: LocalProfileRepository;
  readonly profilePhotoStore: ProfilePhotoStore;
  readonly getLocalProfile: UseCase<void, Result<LocalProfile, AppError>>;
  readonly saveLocalProfile: UseCase<LocalProfileInput, SaveProfileOutcome>;
  readonly pickProfilePhoto: UseCase<void, Result<string | null, AppError>>;
}

export const profileFactories: Factories<
  ProfileDependencies,
  CoreDependencies & Pick<TripsDependencies, 'tripOwnerProvider' | 'imagePickerService'> & ProfileDependencies
> = {
  localProfileRepository: (c) =>
    new StorageLocalProfileRepository(c.keyValueStore, c.logger.child({ scope: 'localProfile' })),
  profilePhotoStore: (c) =>
    Platform.OS === 'web'
      ? new UnsupportedProfilePhotoStore()
      : new FileSystemProfilePhotoStore(c.idGenerator, c.logger.child({ scope: 'profilePhotos' })),
  getLocalProfile: (c) => new GetLocalProfile(c.localProfileRepository, c.tripOwnerProvider),
  saveLocalProfile: (c) =>
    new SaveLocalProfile(c.localProfileRepository, c.tripOwnerProvider, c.profilePhotoStore, c.clock),
  pickProfilePhoto: (c) => new PickProfilePhoto(c.imagePickerService),
};
