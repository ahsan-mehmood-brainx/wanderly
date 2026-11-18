import { AppError } from '@/core/errors/AppError';
import { err, type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';

import { type LocationSearchResult, SEARCH_QUERY_MAX, SEARCH_QUERY_MIN } from '../Place';
import { type PlacesRepository } from '../repositories';

export interface SearchPlacesInput {
  readonly query: string;
  /** The app language: names are localised and cached per language. */
  readonly language?: string;
  readonly signal?: AbortSignal;
}

/**
 * The place search use case: trims the query and searches only when it is
 * {@link SEARCH_QUERY_MIN}–{@link SEARCH_QUERY_MAX} characters; otherwise `badRequest` with no request.
 */
export class SearchPlaces implements UseCase<SearchPlacesInput, Result<readonly LocationSearchResult[], AppError>> {
  constructor(private readonly repository: PlacesRepository) {}

  async execute({
    query,
    language,
    signal,
  }: SearchPlacesInput): Promise<Result<readonly LocationSearchResult[], AppError>> {
    const trimmed = query.trim();
    if (trimmed.length < SEARCH_QUERY_MIN || trimmed.length > SEARCH_QUERY_MAX) {
      return err(new AppError('badRequest', `A search needs ${SEARCH_QUERY_MIN}-${SEARCH_QUERY_MAX} characters`));
    }
    return language === undefined
      ? this.repository.searchLocations(trimmed, signal)
      : this.repository.searchLocations(trimmed, signal, language);
  }
}
