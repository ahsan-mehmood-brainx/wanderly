import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';

import { type Country } from '../Country';
import {
  type CountryDestinationDetails,
  type DestinationCategory,
  type DestinationDetails,
  essentialsOf,
  type Neighbour,
  type PlaceDestinationDetails,
} from '../Destination';
import { countryDestinationId, parseDestinationId } from '../DestinationId';
import { findCuratedBySlug, findCuratedByTitle } from '../editorial';
import { type CountryRepository, type PlaceContentRepository } from '../repositories';
import { categoriesFromDescription, inferCountry } from '../searchMatching';
import { describePlace } from './describePlace';

export interface GetDestinationDetailsInput {
  readonly id: string;
  readonly signal?: AbortSignal;
}

/**
 * Everything the destination screen shows, for any destination id.
 *
 * - **Country:** REST Countries is required (its failure fails the call); the
 *   Wikipedia description and the neighbour list are optional extras.
 * - **City or place:** Wikipedia provides the description and photo; the host
 *   country (from the id, or inferred from the description) provides the
 *   practical information. No country API knows about cities, so a place may
 *   legitimately have neither a description nor a country.
 */
export class GetDestinationDetails implements UseCase<
  GetDestinationDetailsInput,
  Result<DestinationDetails, AppError>
> {
  constructor(
    private readonly countries: CountryRepository,
    private readonly content: Pick<PlaceContentRepository, 'getSummary'>,
  ) {}

  async execute({ id, signal }: GetDestinationDetailsInput): Promise<Result<DestinationDetails, AppError>> {
    const ref = parseDestinationId(id);
    if (!ref) return err(new AppError('notFound', `Not a destination id: ${id}`));

    switch (ref.kind) {
      case 'country':
        return this.countryDetails(id, ref.code, signal);
      case 'curated': {
        const curated = findCuratedBySlug(ref.slug);
        if (!curated) return err(new AppError('notFound', `Unknown destination: ${ref.slug}`));
        return this.placeDetails(id, curated.wikipediaTitle, curated.countryCode, signal, {
          name: curated.name,
          kind: curated.kind,
          categories: curated.categories,
        });
      }
      case 'place': {
        const curated = findCuratedByTitle(ref.title);
        return this.placeDetails(
          id,
          ref.title,
          ref.countryCode,
          signal,
          curated ? { name: curated.name, kind: curated.kind, categories: curated.categories } : undefined,
        );
      }
    }
  }

  private async countryDetails(
    id: string,
    code: string,
    signal: AbortSignal | undefined,
  ): Promise<Result<CountryDestinationDetails, AppError>> {
    const [country, catalog] = await Promise.all([
      this.countries.getByCode(code, signal),
      this.countries.getAll(signal),
    ]);
    if (!country.ok) return country;

    const description = await describePlace(
      this.content,
      [country.value.wikipediaTitle, country.value.name, `${country.value.name} (country)`],
      signal,
    );
    if (!description.ok) return description;

    return ok({
      kind: 'country',
      id,
      country: country.value,
      description: description.value,
      // The neighbour list is a nicety; without the catalogue it is simply omitted.
      neighbours: catalog.ok ? neighboursOf(country.value, catalog.value) : [],
      essentials: essentialsOf(country.value),
    });
  }

  private async placeDetails(
    id: string,
    title: string,
    countryCode: string | null,
    signal: AbortSignal | undefined,
    curated?: { name: string; kind: 'city' | 'place'; categories: readonly DestinationCategory[] },
  ): Promise<Result<PlaceDestinationDetails, AppError>> {
    let country: Country | null = null;
    if (countryCode) {
      const found = await this.countries.getByCode(countryCode, signal);
      if (!found.ok && found.error.kind === 'cancelled') return found;
      country = found.ok ? found.value : null;
    }

    const description = await describePlace(
      this.content,
      [title, country ? `${title}, ${country.name}` : null],
      signal,
    );
    if (!description.ok) return description;
    const summary = description.value.status === 'available' ? description.value.summary : null;

    if (!country && summary?.description) {
      const catalog = await this.countries.getAll(signal);
      if (!catalog.ok && catalog.error.kind === 'cancelled') return catalog;
      if (catalog.ok) country = inferCountry(summary.description, catalog.value);
    }

    const categories = curated?.categories ?? categoriesFromDescription(summary?.description ?? null);
    return ok({
      kind: curated?.kind ?? (categories.includes('city') ? 'city' : 'place'),
      id,
      name: curated?.name ?? summary?.title ?? title,
      description: description.value,
      categories,
      country,
      essentials: country ? essentialsOf(country) : null,
    });
  }
}

function neighboursOf(country: Country, catalog: readonly Country[]): Neighbour[] {
  const byCode3 = new Map(catalog.flatMap((candidate) => (candidate.code3 ? [[candidate.code3, candidate]] : [])));
  return country.borders
    .flatMap((code3) => byCode3.get(code3) ?? [])
    .map((neighbour) => ({
      id: countryDestinationId(neighbour.code),
      name: neighbour.name,
      flagEmoji: neighbour.flag.emoji,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
