import { type AppError } from '@/core/errors/AppError';
import { ok, type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';

import { type CountryRepository } from '../repositories';
import { buildFilterOptions, type FilterOptions } from '../SearchFilters';

export interface GetFilterOptionsInput {
  readonly signal?: AbortSignal;
}

/** Regions, countries and currencies to filter by, from the (cached) country catalogue. */
export class GetFilterOptions implements UseCase<GetFilterOptionsInput, Result<FilterOptions, AppError>> {
  constructor(private readonly countries: Pick<CountryRepository, 'getAll'>) {}

  async execute({ signal }: GetFilterOptionsInput = {}): Promise<Result<FilterOptions, AppError>> {
    const catalog = await this.countries.getAll(signal);
    return catalog.ok ? ok(buildFilterOptions(catalog.value)) : catalog;
  }
}
