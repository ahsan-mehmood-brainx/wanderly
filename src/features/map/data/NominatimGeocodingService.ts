import { type AppError } from '@/core/errors/AppError';
import { type HttpClient } from '@/core/http';
import { ok, type Result } from '@/core/result';
import { type Clock } from '@/core/utils/Clock';

import { type NominatimSearchDto, nominatimSearchDtoSchema } from './dto/nominatimDtos';
import { NOMINATIM_SEARCH_PATH } from './osmApis';
import { DEFAULT_RATE_LIMIT_COOLDOWN_MS, RequestThrottle } from './RequestThrottle';

/** Nominatim's usage policy: at most one request per second. */
export const NOMINATIM_MIN_INTERVAL_MS = 1_000;
const RESULT_LIMIT = 5;

/** The GeocodingService: Nominatim search, spaced and cooled down after a 429. */
export class NominatimGeocodingService {
  constructor(
    private readonly http: HttpClient,
    private readonly clock: Clock,
    private readonly throttle: RequestThrottle = new RequestThrottle({
      minIntervalMs: NOMINATIM_MIN_INTERVAL_MS,
      clock,
    }),
  ) {}

  /**
   * `language` (the app language the caller caches the results under) is sent as
   * Accept-Language; without it the shared interceptor sends the current app language.
   */
  search(query: string, signal?: AbortSignal, language?: string): Promise<Result<NominatimSearchDto, AppError>> {
    return this.throttle.run(async () => {
      const response = await this.http.get(NOMINATIM_SEARCH_PATH, {
        query: { q: query, format: 'jsonv2', limit: RESULT_LIMIT },
        headers: language ? { 'Accept-Language': language } : undefined,
        schema: nominatimSearchDtoSchema,
        signal,
      });
      if (!response.ok) {
        if (response.error.kind === 'rateLimited') {
          this.throttle.coolDown(this.clock.now() + (response.error.retryAfterMs ?? DEFAULT_RATE_LIMIT_COOLDOWN_MS));
        }
        return response;
      }
      return ok(response.value.data);
    }, signal);
  }
}
