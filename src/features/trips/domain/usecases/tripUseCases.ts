import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';
import { type Clock } from '@/core/utils/Clock';
import { type IdGenerator } from '@/core/utils/IdGenerator';

import { localDateAt } from '../localDate';
import { type TripCoverStore, type TripOwnerProvider, type TripRepository } from '../repositories';
import { type StoredTrip, type Trip, type TripDraft, type TripInput } from '../Trip';
import { withStatus } from '../tripStatus';
import { toConflict, type TripValidationErrors, validateTripInput } from '../tripValidation';

export type SaveTripOutcome =
  | { readonly status: 'saved'; readonly trip: Trip }
  /** Nothing was saved; the form shows these errors. */
  | { readonly status: 'invalid'; readonly errors: TripValidationErrors }
  /** Nothing was saved (`storage`, `notFound` when the trip was deleted meanwhile, `unauthorized` when signed out). */
  | { readonly status: 'failed'; readonly error: AppError };

const today = (clock: Clock) => localDateAt(clock.now());

/**
 * The account to act for. Each use case reads it once, up front, so all the steps
 * of one operation apply to the same account even if the session changes meanwhile.
 */
function requireOwner(owners: TripOwnerProvider): Result<string, AppError> {
  const ownerId = owners.currentOwnerId();
  return ownerId === null ? err(new AppError('unauthorized', 'No signed-in account for trips')) : ok(ownerId);
}

/** The signed-in account's trips with their status as of today, ordered by start date. */
export class GetTrips implements UseCase<void, Result<readonly Trip[], AppError>> {
  constructor(
    private readonly repository: TripRepository,
    private readonly owners: TripOwnerProvider,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<Result<readonly Trip[], AppError>> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return owner;
    const trips = await this.repository.list(owner.value);
    if (!trips.ok) return trips;
    const date = today(this.clock);
    return ok(trips.value.map((trip) => withStatus(trip, date)));
  }
}

/** One of the signed-in account's trips, or `notFound`. */
export class GetTrip implements UseCase<string, Result<Trip, AppError>> {
  constructor(
    private readonly repository: TripRepository,
    private readonly owners: TripOwnerProvider,
    private readonly clock: Clock,
  ) {}

  async execute(id: string): Promise<Result<Trip, AppError>> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return owner;
    const found = await this.repository.findById(owner.value, id);
    if (!found.ok) return found;
    if (!found.value) return err(new AppError('notFound', `Trip ${id} not found`));
    return ok(withStatus(found.value, today(this.clock)));
  }
}

interface CoverChange {
  /** What to save with the trip. */
  readonly reference: string | null;
  /** Copied in for this save: delete it if the save fails. */
  readonly imported: string | null;
}

/** Copies a newly picked cover in; keeps an unchanged one; `null` clears it. */
async function prepareCover(
  store: TripCoverStore,
  requested: string | null,
  previous: string | null,
): Promise<Result<CoverChange, AppError>> {
  if (requested === null) return ok({ reference: null, imported: null });
  if (requested === previous || store.isStoredReference(requested)) {
    return ok({ reference: requested, imported: null });
  }
  const imported = await store.importImage(requested);
  if (!imported.ok) return imported;
  return ok({ reference: imported.value, imported: imported.value });
}

/** Overlap check against storage (see `tripsOverlap` for the rule). */
async function checkOverlap(
  repository: TripRepository,
  ownerId: string,
  draft: TripDraft,
  excludeId: string | null,
): Promise<Result<TripValidationErrors | null, AppError>> {
  const overlapping = await repository.findOverlapping(ownerId, draft, excludeId);
  if (!overlapping.ok) return overlapping;
  const [first] = overlapping.value;
  return ok(first ? { fields: { dates: 'overlap' }, conflict: toConflict(first) } : null);
}

/**
 * Validates and saves a new trip. Order matters: everything that can reject the
 * trip runs before the cover photo is copied, and a copied photo is removed again
 * if the insert fails, so a failed save leaves nothing behind.
 */
export class CreateTrip implements UseCase<TripInput, SaveTripOutcome> {
  constructor(
    private readonly repository: TripRepository,
    private readonly owners: TripOwnerProvider,
    private readonly covers: TripCoverStore,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(input: TripInput): Promise<SaveTripOutcome> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return { status: 'failed', error: owner.error };
    const ownerId = owner.value;

    const validation = validateTripInput(input);
    if (!validation.ok) return { status: 'invalid', errors: validation.errors };
    const { draft } = validation;

    const overlap = await checkOverlap(this.repository, ownerId, draft, null);
    if (!overlap.ok) return { status: 'failed', error: overlap.error };
    if (overlap.value) return { status: 'invalid', errors: overlap.value };

    const cover = await prepareCover(this.covers, draft.coverImage, null);
    if (!cover.ok) return { status: 'failed', error: cover.error };

    const now = this.clock.now();
    const trip: StoredTrip = {
      id: this.idGenerator(),
      ...fromDraft(draft, cover.value.reference),
      cancelledAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const saved = await this.repository.insert(ownerId, trip);
    if (!saved.ok) {
      if (cover.value.imported) await this.covers.remove(cover.value.imported);
      return { status: 'failed', error: saved.error };
    }
    return { status: 'saved', trip: withStatus(trip, localDateAt(now)) };
  }
}

export interface UpdateTripInput {
  readonly id: string;
  readonly input: TripInput;
}

/**
 * Saves changes to an existing trip. A cancelled trip keeps its cancellation and
 * isn't checked for overlaps (it doesn't hold its dates). A replaced or removed
 * cover photo is deleted only after the update is saved.
 */
export class UpdateTrip implements UseCase<UpdateTripInput, SaveTripOutcome> {
  constructor(
    private readonly repository: TripRepository,
    private readonly owners: TripOwnerProvider,
    private readonly covers: TripCoverStore,
    private readonly clock: Clock,
  ) {}

  async execute({ id, input }: UpdateTripInput): Promise<SaveTripOutcome> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return { status: 'failed', error: owner.error };
    const ownerId = owner.value;

    const validation = validateTripInput(input);
    if (!validation.ok) return { status: 'invalid', errors: validation.errors };
    const { draft } = validation;

    const existing = await this.repository.findById(ownerId, id);
    if (!existing.ok) return { status: 'failed', error: existing.error };
    if (!existing.value) return { status: 'failed', error: new AppError('notFound', `Trip ${id} not found`) };
    const previous = existing.value;

    if (previous.cancelledAt === null) {
      const overlap = await checkOverlap(this.repository, ownerId, draft, id);
      if (!overlap.ok) return { status: 'failed', error: overlap.error };
      if (overlap.value) return { status: 'invalid', errors: overlap.value };
    }

    const cover = await prepareCover(this.covers, draft.coverImage, previous.coverImage);
    if (!cover.ok) return { status: 'failed', error: cover.error };

    const now = this.clock.now();
    const trip: StoredTrip = { ...previous, ...fromDraft(draft, cover.value.reference), updatedAt: now };
    const saved = await this.repository.update(ownerId, trip);
    if (!saved.ok) {
      if (cover.value.imported) await this.covers.remove(cover.value.imported);
      return { status: 'failed', error: saved.error };
    }
    if (previous.coverImage && previous.coverImage !== trip.coverImage) await this.covers.remove(previous.coverImage);
    return { status: 'saved', trip: withStatus(trip, localDateAt(now)) };
  }
}

/** Deletes a trip and then its cover photo. */
export class DeleteTrip implements UseCase<string, Result<void, AppError>> {
  constructor(
    private readonly repository: TripRepository,
    private readonly owners: TripOwnerProvider,
    private readonly covers: TripCoverStore,
  ) {}

  async execute(id: string): Promise<Result<void, AppError>> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return owner;
    const existing = await this.repository.findById(owner.value, id);
    if (!existing.ok) return existing;
    if (!existing.value) return err(new AppError('notFound', `Trip ${id} not found`));

    const deleted = await this.repository.delete(owner.value, id);
    if (!deleted.ok) return deleted;
    if (existing.value.coverImage) await this.covers.remove(existing.value.coverImage);
    return ok(undefined);
  }
}

export interface SetTripCancelledInput {
  readonly id: string;
  readonly cancelled: boolean;
}

/**
 * Cancels a trip (frees its dates) or restores it. Restoring is refused with an
 * `overlap` error if another trip took those dates meanwhile.
 */
export class SetTripCancelled implements UseCase<SetTripCancelledInput, SaveTripOutcome> {
  constructor(
    private readonly repository: TripRepository,
    private readonly owners: TripOwnerProvider,
    private readonly clock: Clock,
  ) {}

  async execute({ id, cancelled }: SetTripCancelledInput): Promise<SaveTripOutcome> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return { status: 'failed', error: owner.error };
    const ownerId = owner.value;

    const existing = await this.repository.findById(ownerId, id);
    if (!existing.ok) return { status: 'failed', error: existing.error };
    if (!existing.value) return { status: 'failed', error: new AppError('notFound', `Trip ${id} not found`) };
    const previous = existing.value;
    const now = this.clock.now();

    if ((previous.cancelledAt !== null) === cancelled) {
      return { status: 'saved', trip: withStatus(previous, localDateAt(now)) };
    }

    if (!cancelled) {
      const overlapping = await this.repository.findOverlapping(ownerId, previous, id);
      if (!overlapping.ok) return { status: 'failed', error: overlapping.error };
      const [first] = overlapping.value;
      if (first) return { status: 'invalid', errors: { fields: { dates: 'overlap' }, conflict: toConflict(first) } };
    }

    const trip: StoredTrip = { ...previous, cancelledAt: cancelled ? now : null, updatedAt: now };
    const saved = await this.repository.update(ownerId, trip);
    if (!saved.ok) return { status: 'failed', error: saved.error };
    return { status: 'saved', trip: withStatus(trip, localDateAt(now)) };
  }
}

function fromDraft(draft: TripDraft, coverImage: string | null) {
  return {
    title: draft.title,
    destinationId: draft.destination.id,
    destinationName: draft.destination.name,
    startDate: draft.startDate,
    endDate: draft.endDate,
    description: draft.description,
    coverImage,
    budget: draft.budget,
    currency: draft.currency,
  } satisfies Partial<StoredTrip>;
}
