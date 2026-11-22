import { Platform } from 'react-native';

import { type CoreDependencies } from '@/core/di/CoreDependencies';
import { type Factories } from '@/core/di/createContainer';
import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';
import { type AuthDependencies } from '@/features/auth/di';

import { ExpoImagePickerService } from './data/ExpoImagePickerService';
import { FileSystemTripCoverStore, UnsupportedTripCoverStore } from './data/FileSystemTripCoverStore';
import { LocalTripRepository } from './data/LocalTripRepository';
import { SessionTripOwnerProvider } from './data/SessionTripOwnerProvider';
import {
  type ImagePickerService,
  type TripCoverStore,
  type TripOwnerProvider,
  type TripRepository,
} from './domain/repositories';
import { type Trip, type TripInput } from './domain/Trip';
import { PickCoverImage } from './domain/usecases/PickCoverImage';
import {
  CreateTrip,
  DeleteTrip,
  GetTrip,
  GetTrips,
  type SaveTripOutcome,
  SetTripCancelled,
  type SetTripCancelledInput,
  SetTripCover,
  type SetTripCoverInput,
  UpdateTrip,
  type UpdateTripInput,
} from './domain/usecases/tripUseCases';

export interface TripsDependencies {
  readonly tripRepository: TripRepository;
  readonly tripOwnerProvider: TripOwnerProvider;
  readonly tripCoverStore: TripCoverStore;
  readonly imagePickerService: ImagePickerService;
  readonly getTrips: UseCase<void, Result<readonly Trip[], AppError>>;
  readonly getTrip: UseCase<string, Result<Trip, AppError>>;
  readonly createTrip: UseCase<TripInput, SaveTripOutcome>;
  readonly updateTrip: UseCase<UpdateTripInput, SaveTripOutcome>;
  readonly deleteTrip: UseCase<string, Result<void, AppError>>;
  readonly setTripCancelled: UseCase<SetTripCancelledInput, SaveTripOutcome>;
  readonly setTripCover: UseCase<SetTripCoverInput, SaveTripOutcome>;
  readonly pickCoverImage: UseCase<void, Result<string | null, AppError>>;
}

export const tripsFactories: Factories<
  TripsDependencies,
  CoreDependencies & Pick<AuthDependencies, 'sessionManager'> & TripsDependencies
> = {
  tripRepository: (c) => new LocalTripRepository(c.database, c.logger.child({ scope: 'trips' })),
  tripOwnerProvider: (c) => new SessionTripOwnerProvider(c.sessionManager),
  tripCoverStore: (c) =>
    Platform.OS === 'web'
      ? new UnsupportedTripCoverStore()
      : new FileSystemTripCoverStore(c.idGenerator, c.logger.child({ scope: 'tripCovers' })),
  imagePickerService: (c) => new ExpoImagePickerService(c.logger.child({ scope: 'imagePicker' })),
  getTrips: (c) => new GetTrips(c.tripRepository, c.tripOwnerProvider, c.clock),
  getTrip: (c) => new GetTrip(c.tripRepository, c.tripOwnerProvider, c.clock),
  createTrip: (c) => new CreateTrip(c.tripRepository, c.tripOwnerProvider, c.tripCoverStore, c.clock, c.idGenerator),
  updateTrip: (c) => new UpdateTrip(c.tripRepository, c.tripOwnerProvider, c.tripCoverStore, c.clock),
  deleteTrip: (c) => new DeleteTrip(c.tripRepository, c.tripOwnerProvider, c.tripCoverStore),
  setTripCancelled: (c) => new SetTripCancelled(c.tripRepository, c.tripOwnerProvider, c.clock),
  setTripCover: (c) => new SetTripCover(c.tripRepository, c.tripOwnerProvider, c.tripCoverStore, c.clock),
  pickCoverImage: (c) => new PickCoverImage(c.imagePickerService),
};
