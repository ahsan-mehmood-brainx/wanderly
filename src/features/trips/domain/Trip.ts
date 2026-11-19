import { type LocalDate } from './localDate';

/**
 * - `upcoming`: starts after today.
 * - `ongoing`: today is between the start and end dates (inclusive).
 * - `completed`: ended before today.
 * - `cancelled`: the traveller called it off. The only status that isn't derived
 *   from the dates; it wins over the other three.
 */
export const TRIP_STATUSES = ['upcoming', 'ongoing', 'completed', 'cancelled'] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

/** A trip as saved on the device. Its status depends on the day it is read, so it isn't stored. */
export interface StoredTrip {
  readonly id: string;
  readonly title: string;
  /**
   * A Discover destination id (`country-pt`, `kyoto`, `place-…`) when picked from
   * search, or a {@link CUSTOM_DESTINATION_PREFIX} id when typed in (e.g. offline).
   */
  readonly destinationId: string;
  /** Saved with the trip so it shows offline and survives catalogue changes. */
  readonly destinationName: string;
  /** First day of the trip. */
  readonly startDate: LocalDate;
  /** Last day of the trip (inclusive); never before `startDate`. */
  readonly endDate: LocalDate;
  /** Empty when there is none. */
  readonly description: string;
  /** Reference returned by `TripCoverStore` (not a display URI), or `null`. */
  readonly coverImage: string | null;
  /** Total budget in the currency's minor units (cents for USD, yen for JPY): an integer, so sums are exact. */
  readonly budget: number;
  /** ISO 4217 code, e.g. `USD`. */
  readonly currency: string;
  /** Epoch ms when the trip was cancelled; `null` while it is on. */
  readonly cancelledAt: number | null;
  /** Epoch ms. */
  readonly createdAt: number;
  /** Epoch ms. */
  readonly updatedAt: number;
}

/** The trip entity: what's stored plus its status on a given day. */
export interface Trip extends StoredTrip {
  readonly status: TripStatus;
}

export interface TripDestination {
  readonly id: string;
  readonly name: string;
}

/**
 * What the traveller entered in the trip form, before validation. Text fields
 * are raw (untrimmed) and the budget is the text as typed, so validation, not
 * the screen, decides what is acceptable.
 */
export interface TripInput {
  readonly title: string;
  readonly destination: TripDestination | null;
  readonly startDate: LocalDate | null;
  readonly endDate: LocalDate | null;
  readonly description: string;
  /** A stored cover reference (unchanged), a newly picked image URI, or `null` for none. */
  readonly coverImage: string | null;
  readonly budget: string;
  readonly currency: string;
}

/** A validated {@link TripInput}: trimmed text and the budget in minor units. */
export interface TripDraft {
  readonly title: string;
  readonly destination: TripDestination;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate;
  readonly description: string;
  readonly coverImage: string | null;
  readonly budget: number;
  readonly currency: string;
}

export const TRIP_LIMITS = {
  titleMaxLength: 80,
  destinationNameMaxLength: 120,
  descriptionMaxLength: 2000,
  /** Longest trip, in days including both ends. */
  maxDurationDays: 366,
  /** Upper bound in major units (10 million), well past any trip and far inside safe integers. */
  maxBudgetMajor: 10_000_000,
} as const;

/**
 * Destinations typed in by the traveller instead of picked from search (for
 * example while offline). The colon can never appear in a Discover id or a route
 * id, so these never resolve to a destination page.
 */
export const CUSTOM_DESTINATION_PREFIX = 'custom:';

export function customDestination(name: string): TripDestination {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  return { id: `${CUSTOM_DESTINATION_PREFIX}${trimmed.toLowerCase()}`, name: trimmed };
}

export function isCustomDestination(destinationId: string): boolean {
  return destinationId.startsWith(CUSTOM_DESTINATION_PREFIX);
}
