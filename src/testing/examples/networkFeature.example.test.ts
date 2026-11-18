/**
 * Executable reference: how a network-backed feature is built on this architecture.
 *
 * It lives in a test so it ships no product code. A real feature splits these
 * pieces across `features/<name>/{domain,data,di.ts}` exactly as labelled below.
 * The example API (public holidays) is illustrative only.
 */
import { z } from 'zod';

import { type CoreDependencies } from '@/core/di/CoreDependencies';
import { createContainer, type Factories, valueFactories } from '@/core/di/createContainer';
import { AppError } from '@/core/errors/AppError';
import { ApiError, type HttpClient } from '@/core/http';
import { err, ok, type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';
import { type Clock } from '@/core/utils/Clock';
import { apiSuccess, FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { ManualClock } from '@/testing/ManualClock';
import { testCoreFactories } from '@/testing/testDependencies';

// ─── domain/Holiday.ts: entity (app vocabulary, no API field names) ──────────
interface Holiday {
  readonly date: string; // ISO yyyy-mm-dd
  readonly name: string;
  readonly localName: string;
}

// ─── domain/HolidayRepository.ts: port owned by the domain ───────────────────
interface HolidayRepository {
  getHolidays(year: number, countryCode: string, signal?: AbortSignal): Promise<Result<Holiday[], AppError>>;
}

// ─── domain/usecases/GetUpcomingHolidays.ts: business rules only ─────────────
interface UpcomingHolidaysInput {
  readonly countryCode: string;
  readonly limit: number;
  readonly signal?: AbortSignal;
}

class GetUpcomingHolidays implements UseCase<UpcomingHolidaysInput, Result<Holiday[], AppError>> {
  constructor(
    private readonly repository: HolidayRepository,
    private readonly clock: Clock,
  ) {}

  async execute({ countryCode, limit, signal }: UpcomingHolidaysInput): Promise<Result<Holiday[], AppError>> {
    const today = new Date(this.clock.now()).toISOString().slice(0, 10);
    const result = await this.repository.getHolidays(Number(today.slice(0, 4)), countryCode, signal);
    if (!result.ok) return result;
    const upcoming = result.value
      .filter((holiday) => holiday.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date));
    return ok(upcoming.slice(0, limit));
  }
}

// ─── data/dto/HolidayDto.ts: the API's shape, validated at the boundary ──────
const holidayDtoSchema = z.object({
  date: z.string(),
  name: z.string(),
  localName: z.string(),
  countryCode: z.string(),
});
const holidayListDtoSchema = z.array(holidayDtoSchema);
type HolidayDto = z.infer<typeof holidayDtoSchema>;

// ─── data/mappers/holidayMapper.ts: Adapter, DTO → entity ────────────────────
const toHoliday = (dto: HolidayDto): Holiday => ({ date: dto.date, name: dto.name, localName: dto.localName });

// ─── data/HttpHolidayRepository.ts: concrete repository over the HttpClient facade
class HttpHolidayRepository implements HolidayRepository {
  constructor(private readonly http: HttpClient) {}

  async getHolidays(year: number, countryCode: string, signal?: AbortSignal): Promise<Result<Holiday[], AppError>> {
    const result = await this.http.get(`/PublicHolidays/${year}/${encodeURIComponent(countryCode)}`, {
      schema: holidayListDtoSchema,
      signal,
    });
    // ApiError is an AppError: no translation needed, the kind flows straight to the UI.
    return result.ok ? ok(result.value.data.map(toHoliday)) : err(result.error);
  }
}

// ─── di.ts: the feature's DI module ──────────────────────────────────────────
interface HolidayDependencies {
  readonly holidayRepository: HolidayRepository;
  readonly getUpcomingHolidays: UseCase<UpcomingHolidaysInput, Result<Holiday[], AppError>>;
}

const HOLIDAYS_API = { name: 'holidays', baseUrl: 'https://holidays.example.com/api/v3' };

const holidayFactories: Factories<HolidayDependencies, CoreDependencies & HolidayDependencies> = {
  holidayRepository: (c) => new HttpHolidayRepository(c.httpClientFactory.create(HOLIDAYS_API)),
  getUpcomingHolidays: (c) => new GetUpcomingHolidays(c.holidayRepository, c.clock),
};

// ─── Tests ──────────────────────────────────────────────────────────────────
const JUNE_1_2026 = Date.UTC(2026, 5, 1);
const dto = (date: string, name: string) => ({ date, name, localName: name, countryCode: 'PT' });

describe('Example network feature', () => {
  describe('use case, tested with a mock repository (no HTTP at all)', () => {
    const mockRepository = (result: Result<Holiday[], AppError>): jest.Mocked<HolidayRepository> => ({
      getHolidays: jest.fn().mockResolvedValue(result),
    });

    it('returns upcoming holidays in date order, limited', async () => {
      const repository = mockRepository(
        ok([
          { date: '2026-12-25', name: 'Christmas', localName: 'Natal' },
          { date: '2026-01-01', name: 'New Year', localName: 'Ano Novo' },
          { date: '2026-06-10', name: 'Portugal Day', localName: 'Dia de Portugal' },
          { date: '2026-08-15', name: 'Assumption', localName: 'Assunção' },
        ]),
      );
      const useCase = new GetUpcomingHolidays(repository, new ManualClock(JUNE_1_2026));

      const result = await useCase.execute({ countryCode: 'PT', limit: 2 });

      expect(result.ok && result.value.map((holiday) => holiday.name)).toEqual(['Portugal Day', 'Assumption']);
      expect(repository.getHolidays).toHaveBeenCalledWith(2026, 'PT', undefined);
    });

    it('passes repository failures through untouched', async () => {
      const failure = new AppError('offline', 'offline');
      const useCase = new GetUpcomingHolidays(mockRepository(err(failure)), new ManualClock(JUNE_1_2026));
      await expect(useCase.execute({ countryCode: 'PT', limit: 2 })).resolves.toEqual(err(failure));
    });
  });

  describe('repository, tested against a FakeHttpClient (no real requests)', () => {
    function setup() {
      const factory = new FakeHttpClientFactory();
      // Same composition as production: core ports (faked) + the feature's DI module.
      const dependencies = createContainer<CoreDependencies & HolidayDependencies>({
        ...testCoreFactories(),
        ...holidayFactories,
        ...valueFactories<CoreDependencies>({ httpClientFactory: factory, clock: new ManualClock(JUNE_1_2026) }),
      });
      return { dependencies, http: factory.client(HOLIDAYS_API.name), factory };
    }

    it('calls the right endpoint and maps DTOs to entities', async () => {
      const { dependencies, http, factory } = setup();
      http.on('GET', '/PublicHolidays/2026/PT', apiSuccess([dto('2026-06-10', 'Portugal Day')]));

      const result = await dependencies.getUpcomingHolidays.execute({ countryCode: 'PT', limit: 5 });

      expect(result).toEqual(ok([{ date: '2026-06-10', name: 'Portugal Day', localName: 'Portugal Day' }]));
      expect(factory.created).toEqual([HOLIDAYS_API]);
    });

    it('rejects payloads that do not match the DTO with a parse error', async () => {
      const { dependencies, http } = setup();
      http.on('GET', '/PublicHolidays/2026/PT', apiSuccess([{ date: 20260610 }]));

      const result = await dependencies.holidayRepository.getHolidays(2026, 'PT');

      expect(!result.ok && result.error.kind).toBe('parse');
    });

    it('surfaces HTTP failures with their kind', async () => {
      const { dependencies, http } = setup();
      http.on('GET', '/PublicHolidays/2026/XX', err(new ApiError('notFound', 'Request failed with status 404')));

      const result = await dependencies.holidayRepository.getHolidays(2026, 'XX');

      expect(!result.ok && result.error.kind).toBe('notFound');
    });

    it('forwards the cancellation signal', async () => {
      const { dependencies, http } = setup();
      const controller = new AbortController();
      controller.abort();

      const result = await dependencies.holidayRepository.getHolidays(2026, 'PT', controller.signal);

      expect(!result.ok && result.error.kind).toBe('cancelled');
      expect(http.requests[0]?.signal).toBe(controller.signal);
    });
  });
});
