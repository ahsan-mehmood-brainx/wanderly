import { type LocalDate } from '@/features/trips/domain/localDate';

import { type LocalTime } from './localTime';

export const ACTIVITY_CATEGORIES = [
  'sightseeing',
  'food',
  'shopping',
  'transportation',
  'accommodation',
  'entertainment',
  'other',
] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

/** One planned activity on one day of a trip. */
export interface Activity {
  readonly id: string;
  readonly tripId: string;
  readonly title: string;
  /** Empty when there is none. */
  readonly description: string;
  readonly category: ActivityCategory;
  readonly date: LocalDate;
  /** Wall-clock time at the destination, or `null` when untimed. */
  readonly startTime: LocalTime | null;
  /** Later than `startTime` on the same day; only set when `startTime` is. */
  readonly endTime: LocalTime | null;
  /** Both set or both `null`. */
  readonly latitude: number | null;
  readonly longitude: number | null;
  /** Empty when there is none. */
  readonly address: string;
  /** In the currency's minor units, or `null` when no cost was entered. */
  readonly estimatedCost: number | null;
  /** ISO 4217 code. */
  readonly currency: string;
  /** Empty when there are none. */
  readonly notes: string;
  /** Position within its day, 0 first. */
  readonly sortOrder: number;
  readonly isCompleted: boolean;
  /** Epoch ms. */
  readonly createdAt: number;
  /** Epoch ms. */
  readonly updatedAt: number;
}

/** What the traveller entered in the activity form, before validation. Text is raw and the cost is as typed. */
export interface ActivityInput {
  readonly title: string;
  readonly description: string;
  readonly category: ActivityCategory | null;
  readonly date: LocalDate | null;
  readonly startTime: LocalTime | null;
  readonly endTime: LocalTime | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly address: string;
  /** Empty for no cost. */
  readonly estimatedCost: string;
  readonly currency: string;
  readonly notes: string;
}

/** A validated {@link ActivityInput}: trimmed text and the cost in minor units. */
export interface ActivityDraft {
  readonly title: string;
  readonly description: string;
  readonly category: ActivityCategory;
  readonly date: LocalDate;
  readonly startTime: LocalTime | null;
  readonly endTime: LocalTime | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly address: string;
  readonly estimatedCost: number | null;
  readonly currency: string;
  readonly notes: string;
}

export const ACTIVITY_LIMITS = {
  titleMaxLength: 80,
  descriptionMaxLength: 2000,
  notesMaxLength: 2000,
  addressMaxLength: 200,
  /** Upper bound for a cost in major units. */
  maxCostMajor: 1_000_000,
  maxActivitiesPerDay: 50,
} as const;
