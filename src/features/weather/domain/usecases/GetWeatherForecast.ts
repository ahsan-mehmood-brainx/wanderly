import { type AppError, type AppErrorKind } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { err, ok, type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';
import { type Clock } from '@/core/utils/Clock';

import { type Coordinates, validateCoordinates } from '../Coordinates';
import { type WeatherCache, type WeatherRepository } from '../repositories';
import { type WeatherForecast, type WeatherReport } from '../Weather';
import { HOUR_MS } from '../weatherCalculations';

export interface GetWeatherForecastInput {
  /** Untrusted: validated and rounded here. `null` means the place has no known position. */
  readonly location: Partial<Coordinates> | null | undefined;
  /** Skip the saved copy even if it is fresh (pull to refresh, "try again"). */
  readonly forceRefresh?: boolean;
  readonly signal?: AbortSignal;
}

export interface WeatherCachePolicy {
  /** A saved forecast younger than this is used without a request. */
  readonly freshForMs: number;
  /** When the network fails, a saved forecast up to this old is shown (marked as saved). */
  readonly usableForMs: number;
}

/**
 * Open-Meteo updates most models hourly; 15 minutes keeps launches instant
 * without showing noticeably old weather. A saved forecast covers 7 days, so
 * after 3 days offline it still has 4 days of forecast to show.
 */
export const DEFAULT_WEATHER_CACHE_POLICY: WeatherCachePolicy = {
  freshForMs: 15 * 60_000,
  usableForMs: 72 * HOUR_MS,
};

/**
 * Failures where showing the last saved forecast beats an error: connectivity,
 * an overloaded or misbehaving service. Not `badRequest` (the request itself is
 * wrong) and not `cancelled` (nobody is waiting).
 */
const FALLBACK_KINDS: ReadonlySet<AppErrorKind> = new Set([
  'offline',
  'network',
  'timeout',
  'server',
  'rateLimited',
  'parse',
  'unknown',
]);

/**
 * Weather for a position, with offline support:
 *
 * 1. Invalid or missing coordinates fail without a request.
 * 2. A fresh saved forecast is returned as is (unless `forceRefresh`).
 * 3. Otherwise the forecast is downloaded and saved.
 * 4. If that fails for a transient reason, a saved forecast that is still
 *    usable is returned with the reason, so the UI can say it isn't live.
 */
export class GetWeatherForecast implements UseCase<GetWeatherForecastInput, Result<WeatherReport, AppError>> {
  constructor(
    private readonly repository: WeatherRepository,
    private readonly cache: WeatherCache,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly policy: WeatherCachePolicy = DEFAULT_WEATHER_CACHE_POLICY,
  ) {}

  async execute({
    location,
    forceRefresh = false,
    signal,
  }: GetWeatherForecastInput): Promise<Result<WeatherReport, AppError>> {
    const valid = validateCoordinates(location);
    if (!valid.ok) return valid;
    const coordinates = valid.value;

    const saved = await this.cache.load(coordinates);
    if (saved && !forceRefresh && this.age(saved) < this.policy.freshForMs) {
      return ok({ forecast: saved, source: 'cache', fallbackReason: null });
    }

    const downloaded = await this.repository.getForecast(coordinates, signal);
    if (downloaded.ok) {
      await this.cache.save(downloaded.value);
      return ok({ forecast: downloaded.value, source: 'network', fallbackReason: null });
    }

    const { kind } = downloaded.error;
    if (saved && FALLBACK_KINDS.has(kind) && this.age(saved) < this.policy.usableForMs) {
      this.logger.info('Showing a saved forecast', { reason: kind, ageMinutes: Math.round(this.age(saved) / 60_000) });
      return ok({ forecast: saved, source: 'cache', fallbackReason: kind });
    }
    return err(downloaded.error);
  }

  private age(forecast: WeatherForecast): number {
    return Math.max(0, this.clock.now() - forecast.fetchedAt);
  }
}
