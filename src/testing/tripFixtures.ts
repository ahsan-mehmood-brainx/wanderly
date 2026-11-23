import { APP_MIGRATIONS } from '@/bootstrap/databaseMigrations';
import { SqliteDatabase } from '@/core/database/SqliteDatabase';
import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';
import { LocalTripRepository } from '@/features/trips/data/LocalTripRepository';
import {
  type ImagePickerService,
  type PickImageOptions,
  type TripCoverStore,
  type TripOwnerProvider,
} from '@/features/trips/domain/repositories';
import { type StoredTrip, type TripInput } from '@/features/trips/domain/Trip';

import { nodeSqliteDriver } from './nodeSqliteDriver';

/**
 * 15 June 2027, 12:00 UTC. Midday keeps it the same calendar date in every time
 * zone from UTC-11 to UTC+11, so date-based tests don't depend on the machine.
 */
export const TRIPS_NOW = Date.UTC(2027, 5, 15, 12);
export const TRIPS_TODAY = '2027-06-15';

/** The account signed in by default in tests. */
export const TRIP_OWNER = '1';
export const OTHER_TRIP_OWNER = '2';

export class FakeTripOwnerProvider implements TripOwnerProvider {
  constructor(public ownerId: string | null = TRIP_OWNER) {}

  currentOwnerId(): string | null {
    return this.ownerId;
  }
}

export function storedTrip(overrides: Partial<StoredTrip> = {}): StoredTrip {
  return {
    id: 'trip-1',
    title: 'Lisbon getaway',
    destinationId: 'country-pt',
    destinationName: 'Portugal',
    startDate: '2027-07-01',
    endDate: '2027-07-05',
    description: '',
    coverImage: null,
    budget: 150_000,
    currency: 'USD',
    cancelledAt: null,
    createdAt: TRIPS_NOW,
    updatedAt: TRIPS_NOW,
    ...overrides,
  };
}

export function tripInput(overrides: Partial<TripInput> = {}): TripInput {
  return {
    title: 'Lisbon getaway',
    destination: { id: 'country-pt', name: 'Portugal' },
    startDate: '2027-07-01',
    endDate: '2027-07-05',
    description: '',
    coverImage: null,
    budget: '1500',
    currency: 'USD',
    ...overrides,
  };
}

/** Real in-memory SQLite plus a repository on it. Pass `database` to a container to share the data. */
export function createTripStorage() {
  const handle = nodeSqliteDriver();
  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), child: jest.fn() };
  logger.child.mockReturnValue(logger);
  const database = new SqliteDatabase({ driver: handle.driver, migrations: APP_MIGRATIONS, logger });
  return { database, handle, logger, repository: new LocalTripRepository(database, logger) };
}

/** Storage already holding `trips`, all belonging to `ownerId`. */
export async function seededTripDatabase(trips: readonly StoredTrip[], ownerId = TRIP_OWNER) {
  const storage = createTripStorage();
  for (const trip of trips) {
    const saved = await storage.repository.insert(ownerId, trip);
    if (!saved.ok) throw saved.error;
  }
  return storage;
}

export class FakeTripCoverStore implements TripCoverStore {
  readonly supported: boolean = true;
  readonly stored = new Set<string>();
  readonly removed: string[] = [];
  failImports = false;
  private next = 0;

  async importImage(sourceUri: string): Promise<Result<string, AppError>> {
    if (this.failImports) return err(new AppError('storage', `Could not copy ${sourceUri}`));
    const reference = `trip-covers/cover-${++this.next}.jpg`;
    this.stored.add(reference);
    return ok(reference);
  }

  isStoredReference(value: string): boolean {
    return value.startsWith('trip-covers/');
  }

  async remove(reference: string): Promise<void> {
    this.removed.push(reference);
    this.stored.delete(reference);
  }

  displayUri(reference: string): string {
    return `file:///documents/${reference}`;
  }
}

export class FakeImagePickerService implements ImagePickerService {
  result: Result<string | null, AppError> = ok(null);
  readonly pickImage = jest.fn(async (_options?: PickImageOptions) => this.result);
}
