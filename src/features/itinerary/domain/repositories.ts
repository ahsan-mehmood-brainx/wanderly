import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';
import { type LocalDate } from '@/features/trips/domain/localDate';

import { type Activity } from './Activity';

/**
 * Activities saved on the device, kept separately per account like trips. Every
 * operation takes the owner and only sees that owner's activities. Every
 * operation works offline. Failures are `storage` errors; changes to a missing
 * activity are `notFound`. Deleting a trip deletes its activities.
 */
export interface ActivityRepository {
  /** The trip's activities, by date then `sortOrder`. */
  listByTrip(ownerId: string, tripId: string): Promise<Result<readonly Activity[], AppError>>;
  findById(ownerId: string, id: string): Promise<Result<Activity | null, AppError>>;
  /**
   * Saves a new activity at `activity.sortOrder` on its day; activities at or after
   * that position on the day move down one. Fails if the trip doesn't exist.
   */
  insert(ownerId: string, activity: Activity): Promise<Result<void, AppError>>;
  /**
   * Saves changes. When the date or `sortOrder` changes, it is placed at
   * `activity.sortOrder` on its (new) day and both days stay numbered 0..n-1.
   */
  update(ownerId: string, activity: Activity): Promise<Result<void, AppError>>;
  /** Deletes it; the rest of its day stays numbered 0..n-1. */
  delete(ownerId: string, id: string): Promise<Result<void, AppError>>;
  setCompleted(ownerId: string, id: string, isCompleted: boolean, updatedAt: number): Promise<Result<void, AppError>>;
  /**
   * Sets the day's order to `orderedIds` (`sortOrder` 0..n-1) in one transaction.
   * `notFound`, changing nothing, unless `orderedIds` are exactly that day's activities.
   */
  reorder(
    ownerId: string,
    tripId: string,
    date: LocalDate,
    orderedIds: readonly string[],
    updatedAt: number,
  ): Promise<Result<void, AppError>>;
}
