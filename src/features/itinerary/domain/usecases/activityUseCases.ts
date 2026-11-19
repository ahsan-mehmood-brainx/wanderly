import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';
import { type Clock } from '@/core/utils/Clock';
import { type IdGenerator } from '@/core/utils/IdGenerator';
import { type LocalDate } from '@/features/trips/domain/localDate';
import { type TripOwnerProvider, type TripRepository } from '@/features/trips/domain/repositories';
import { type StoredTrip } from '@/features/trips/domain/Trip';

import { type Activity, type ActivityInput } from '../Activity';
import { type ActivityValidationErrors, validateActivityInput } from '../activityValidation';
import { insertionIndex } from '../itinerary';
import { type ActivityRepository } from '../repositories';

export type SaveActivityOutcome =
  | { readonly status: 'saved'; readonly activity: Activity }
  /** Nothing was saved; the form shows these errors. */
  | { readonly status: 'invalid'; readonly errors: ActivityValidationErrors }
  /** Nothing was saved (`storage`, `notFound` when the trip or activity is gone, `unauthorized` when signed out). */
  | { readonly status: 'failed'; readonly error: AppError };

export interface CreateActivityInput {
  readonly tripId: string;
  readonly input: ActivityInput;
}

export interface UpdateActivityInput {
  readonly id: string;
  readonly input: ActivityInput;
}

export interface SetActivityCompletedInput {
  readonly id: string;
  readonly completed: boolean;
}

export interface ReorderActivitiesInput {
  readonly tripId: string;
  readonly date: LocalDate;
  /** Every activity of that day, in the new order. */
  readonly orderedIds: readonly string[];
}

/**
 * The account to act for, read once per operation so every step applies to the
 * same account even if the session changes meanwhile.
 */
function requireOwner(owners: TripOwnerProvider): Result<string, AppError> {
  const ownerId = owners.currentOwnerId();
  return ownerId === null ? err(new AppError('unauthorized', 'No signed-in account for the itinerary')) : ok(ownerId);
}

async function requireTrip(
  trips: TripRepository,
  ownerId: string,
  tripId: string,
): Promise<Result<StoredTrip, AppError>> {
  const found = await trips.findById(ownerId, tripId);
  if (!found.ok) return found;
  return found.value ? ok(found.value) : err(new AppError('notFound', `Trip ${tripId} not found`));
}

async function requireActivity(
  activities: ActivityRepository,
  ownerId: string,
  id: string,
): Promise<Result<Activity, AppError>> {
  const found = await activities.findById(ownerId, id);
  if (!found.ok) return found;
  return found.value ? ok(found.value) : err(new AppError('notFound', `Activity ${id} not found`));
}

/** The trip's activities on `date`, in `sortOrder`. */
async function activitiesOn(
  activities: ActivityRepository,
  ownerId: string,
  tripId: string,
  date: LocalDate | null,
): Promise<Result<readonly Activity[], AppError>> {
  if (date === null) return ok([]);
  const all = await activities.listByTrip(ownerId, tripId);
  if (!all.ok) return all;
  return ok(all.value.filter((item) => item.date === date));
}

/** The trip's activities, by date then `sortOrder`; `notFound` when the trip doesn't exist. */
export class GetItinerary implements UseCase<string, Result<readonly Activity[], AppError>> {
  constructor(
    private readonly activities: ActivityRepository,
    private readonly trips: TripRepository,
    private readonly owners: TripOwnerProvider,
  ) {}

  async execute(tripId: string): Promise<Result<readonly Activity[], AppError>> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return owner;
    const trip = await requireTrip(this.trips, owner.value, tripId);
    if (!trip.ok) return trip;
    return this.activities.listByTrip(owner.value, tripId);
  }
}

export class GetActivity implements UseCase<string, Result<Activity, AppError>> {
  constructor(
    private readonly activities: ActivityRepository,
    private readonly owners: TripOwnerProvider,
  ) {}

  async execute(id: string): Promise<Result<Activity, AppError>> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return owner;
    return requireActivity(this.activities, owner.value, id);
  }
}

/**
 * Validates and saves a new activity, placed on its day by start time (see
 * `insertionIndex`). A trip deleted meanwhile is `notFound` and nothing is saved.
 */
export class CreateActivity implements UseCase<CreateActivityInput, SaveActivityOutcome> {
  constructor(
    private readonly activities: ActivityRepository,
    private readonly trips: TripRepository,
    private readonly owners: TripOwnerProvider,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute({ tripId, input }: CreateActivityInput): Promise<SaveActivityOutcome> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return { status: 'failed', error: owner.error };
    const ownerId = owner.value;

    const trip = await requireTrip(this.trips, ownerId, tripId);
    if (!trip.ok) return { status: 'failed', error: trip.error };

    const sameDay = await activitiesOn(this.activities, ownerId, tripId, input.date);
    if (!sameDay.ok) return { status: 'failed', error: sameDay.error };

    const validation = validateActivityInput(input, { trip: trip.value, sameDay: sameDay.value });
    if (!validation.ok) return { status: 'invalid', errors: validation.errors };
    const { draft } = validation;

    const now = this.clock.now();
    const activity: Activity = {
      id: this.idGenerator(),
      tripId,
      ...draft,
      sortOrder: insertionIndex(sameDay.value, draft.startTime),
      isCompleted: false,
      createdAt: now,
      updatedAt: now,
    };
    const saved = await this.activities.insert(ownerId, activity);
    if (!saved.ok) return { status: 'failed', error: saved.error };
    return { status: 'saved', activity };
  }
}

/**
 * Saves changes to an activity. It keeps its position (which may have been set by
 * dragging) unless its day or start time changes; then it is placed by start time again.
 * An activity left outside the trip's dates must be moved to a trip day to be saved.
 */
export class UpdateActivity implements UseCase<UpdateActivityInput, SaveActivityOutcome> {
  constructor(
    private readonly activities: ActivityRepository,
    private readonly trips: TripRepository,
    private readonly owners: TripOwnerProvider,
    private readonly clock: Clock,
  ) {}

  async execute({ id, input }: UpdateActivityInput): Promise<SaveActivityOutcome> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return { status: 'failed', error: owner.error };
    const ownerId = owner.value;

    const existing = await requireActivity(this.activities, ownerId, id);
    if (!existing.ok) return { status: 'failed', error: existing.error };
    const previous = existing.value;

    const trip = await requireTrip(this.trips, ownerId, previous.tripId);
    if (!trip.ok) return { status: 'failed', error: trip.error };

    const sameDay = await activitiesOn(this.activities, ownerId, previous.tripId, input.date);
    if (!sameDay.ok) return { status: 'failed', error: sameDay.error };

    const validation = validateActivityInput(input, { trip: trip.value, sameDay: sameDay.value, excludeId: id });
    if (!validation.ok) return { status: 'invalid', errors: validation.errors };
    const { draft } = validation;

    const keepsPlace = draft.date === previous.date && draft.startTime === previous.startTime;
    const others = sameDay.value.filter((item) => item.id !== id);
    const activity: Activity = {
      ...previous,
      ...draft,
      sortOrder: keepsPlace ? previous.sortOrder : insertionIndex(others, draft.startTime),
      updatedAt: this.clock.now(),
    };
    const saved = await this.activities.update(ownerId, activity);
    if (!saved.ok) return { status: 'failed', error: saved.error };
    return { status: 'saved', activity };
  }
}

export class DeleteActivity implements UseCase<string, Result<void, AppError>> {
  constructor(
    private readonly activities: ActivityRepository,
    private readonly owners: TripOwnerProvider,
  ) {}

  async execute(id: string): Promise<Result<void, AppError>> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return owner;
    return this.activities.delete(owner.value, id);
  }
}

/** Marks an activity done or not done. Works for any activity, including one outside the trip's dates. */
export class SetActivityCompleted implements UseCase<SetActivityCompletedInput, Result<Activity, AppError>> {
  constructor(
    private readonly activities: ActivityRepository,
    private readonly owners: TripOwnerProvider,
    private readonly clock: Clock,
  ) {}

  async execute({ id, completed }: SetActivityCompletedInput): Promise<Result<Activity, AppError>> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return owner;
    const existing = await requireActivity(this.activities, owner.value, id);
    if (!existing.ok) return existing;

    const updatedAt = this.clock.now();
    const saved = await this.activities.setCompleted(owner.value, id, completed, updatedAt);
    if (!saved.ok) return saved;
    return ok({ ...existing.value, isCompleted: completed, updatedAt });
  }
}

/** Saves a new order for one day and returns that day's activities in it. */
export class ReorderActivities implements UseCase<ReorderActivitiesInput, Result<readonly Activity[], AppError>> {
  constructor(
    private readonly activities: ActivityRepository,
    private readonly owners: TripOwnerProvider,
    private readonly clock: Clock,
  ) {}

  async execute({ tripId, date, orderedIds }: ReorderActivitiesInput): Promise<Result<readonly Activity[], AppError>> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return owner;
    const saved = await this.activities.reorder(owner.value, tripId, date, orderedIds, this.clock.now());
    if (!saved.ok) return saved;
    return activitiesOn(this.activities, owner.value, tripId, date);
  }
}
