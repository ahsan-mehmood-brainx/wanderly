import { type CoreDependencies } from '@/core/di/CoreDependencies';
import { type Factories } from '@/core/di/createContainer';
import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';
import { type TripsDependencies } from '@/features/trips/di';

import { LocalActivityRepository } from './data/LocalActivityRepository';
import { type Activity } from './domain/Activity';
import { type ActivityRepository } from './domain/repositories';
import {
  CreateActivity,
  type CreateActivityInput,
  DeleteActivity,
  GetActivity,
  GetItinerary,
  ReorderActivities,
  type ReorderActivitiesInput,
  type SaveActivityOutcome,
  SetActivityCompleted,
  type SetActivityCompletedInput,
  UpdateActivity,
  type UpdateActivityInput,
} from './domain/usecases/activityUseCases';

export interface ItineraryDependencies {
  readonly activityRepository: ActivityRepository;
  readonly getItinerary: UseCase<string, Result<readonly Activity[], AppError>>;
  readonly getActivity: UseCase<string, Result<Activity, AppError>>;
  readonly createActivity: UseCase<CreateActivityInput, SaveActivityOutcome>;
  readonly updateActivity: UseCase<UpdateActivityInput, SaveActivityOutcome>;
  readonly deleteActivity: UseCase<string, Result<void, AppError>>;
  readonly setActivityCompleted: UseCase<SetActivityCompletedInput, Result<Activity, AppError>>;
  readonly reorderActivities: UseCase<ReorderActivitiesInput, Result<readonly Activity[], AppError>>;
}

export const itineraryFactories: Factories<
  ItineraryDependencies,
  CoreDependencies & Pick<TripsDependencies, 'tripRepository' | 'tripOwnerProvider'> & ItineraryDependencies
> = {
  activityRepository: (c) =>
    new LocalActivityRepository(c.database, c.logger.child({ scope: 'itinerary' }), c.localChangeLog),
  getItinerary: (c) => new GetItinerary(c.activityRepository, c.tripRepository, c.tripOwnerProvider),
  getActivity: (c) => new GetActivity(c.activityRepository, c.tripOwnerProvider),
  createActivity: (c) =>
    new CreateActivity(c.activityRepository, c.tripRepository, c.tripOwnerProvider, c.clock, c.idGenerator),
  updateActivity: (c) => new UpdateActivity(c.activityRepository, c.tripRepository, c.tripOwnerProvider, c.clock),
  deleteActivity: (c) => new DeleteActivity(c.activityRepository, c.tripOwnerProvider),
  setActivityCompleted: (c) => new SetActivityCompleted(c.activityRepository, c.tripOwnerProvider, c.clock),
  reorderActivities: (c) => new ReorderActivities(c.activityRepository, c.tripOwnerProvider, c.clock),
};
