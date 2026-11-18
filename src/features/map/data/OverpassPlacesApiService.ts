import { AppError } from '@/core/errors/AppError';
import { type HttpClient } from '@/core/http';
import { err, ok, type Result } from '@/core/result';
import { type Clock } from '@/core/utils/Clock';
import { type Coordinates } from '@/features/weather/domain/Coordinates';

import { type OverpassResponseDto, overpassResponseDtoSchema } from './dto/overpassDtos';
import { OVERPASS_INTERPRETER_PATH } from './osmApis';
import { buildOverpassQuery } from './overpassQuery';
import { DEFAULT_RATE_LIMIT_COOLDOWN_MS, RequestThrottle } from './RequestThrottle';

/** Overpass fair use: one query at a time, spaced out. */
export const OVERPASS_MIN_INTERVAL_MS = 2_000;

/** Overpass answers 200 with a `remark` when the query failed on the server (timeout, out of memory). */
const RUNTIME_ERROR_REMARK = /runtime error|timed out|timeout|out of memory/i;

/** The PlacesApiService: one Overpass query per (rounded) centre, serialised, spaced and cooled down after a 429. */
export class OverpassPlacesApiService {
  constructor(
    private readonly http: HttpClient,
    private readonly clock: Clock,
    private readonly throttle: RequestThrottle = new RequestThrottle({
      minIntervalMs: OVERPASS_MIN_INTERVAL_MS,
      clock,
    }),
  ) {}

  fetchNearby(center: Coordinates, signal?: AbortSignal): Promise<Result<OverpassResponseDto, AppError>> {
    return this.throttle.run(async () => {
      const response = await this.http.get(OVERPASS_INTERPRETER_PATH, {
        query: { data: buildOverpassQuery(center) },
        schema: overpassResponseDtoSchema,
        signal,
      });
      if (!response.ok) {
        if (response.error.kind === 'rateLimited') {
          this.throttle.coolDown(this.clock.now() + (response.error.retryAfterMs ?? DEFAULT_RATE_LIMIT_COOLDOWN_MS));
        }
        return response;
      }
      const { remark } = response.value.data;
      if (remark && RUNTIME_ERROR_REMARK.test(remark)) {
        return err(new AppError('server', `Overpass could not run the query: ${remark}`));
      }
      return ok(response.value.data);
    }, signal);
  }
}
