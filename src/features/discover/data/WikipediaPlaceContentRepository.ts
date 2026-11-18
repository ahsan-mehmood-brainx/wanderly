import { type AppError } from '@/core/errors/AppError';
import { type HttpClient, noRetry } from '@/core/http';
import { err, ok, type Result } from '@/core/result';

import { type PlaceSearchHit, type PlaceSummary } from '../domain/Destination';
import { type PlaceContentRepository } from '../domain/repositories';
import { WIKIPEDIA_SEARCH_TIMEOUT_MS } from './apis';
import { pageSummaryDtoSchema, titleSearchDtoSchema } from './dto/wikipediaDtos';
import { toPlaceSearchHits, toPlaceSummary } from './mappers';

/** Article titles use underscores in URLs; everything else is percent-encoded (including `/` in "AC/DC"). */
export const summaryPath = (title: string): string =>
  `/api/rest_v1/page/summary/${encodeURIComponent(title.trim().replace(/ /g, '_'))}`;

export const SEARCH_PATH = '/w/rest.php/v1/search/title';

/** Remote content repository over English Wikipedia. */
export class WikipediaPlaceContentRepository implements PlaceContentRepository {
  constructor(private readonly http: HttpClient) {}

  async getSummary(title: string, signal?: AbortSignal): Promise<Result<PlaceSummary | null, AppError>> {
    if (!title.trim()) return ok(null);
    const result = await this.http.get(summaryPath(title), { schema: pageSummaryDtoSchema, signal });
    if (!result.ok) {
      // No article is a normal answer ("no description"), not a failure.
      return result.error.kind === 'notFound' ? ok(null) : err(result.error);
    }
    return ok(toPlaceSummary(result.value.data));
  }

  async searchTitles(
    query: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<Result<readonly PlaceSearchHit[], AppError>> {
    const result = await this.http.get(SEARCH_PATH, {
      query: { q: query, limit },
      schema: titleSearchDtoSchema,
      signal,
      // Search-as-you-type: a newer query replaces this one, so a slow retry is wasted.
      retry: noRetry,
      timeoutMs: WIKIPEDIA_SEARCH_TIMEOUT_MS,
    });
    return result.ok ? ok(toPlaceSearchHits(result.value.data)) : err(result.error);
  }
}
