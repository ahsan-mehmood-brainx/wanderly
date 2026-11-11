import { AppError } from '@/core/errors/AppError';
import { type HttpClient } from '@/core/http';
import { type Logger } from '@/core/logging/Logger';
import { err, ok, type Result } from '@/core/result';

import { type Country } from '../domain/Country';
import { type CountryRepository } from '../domain/repositories';
import { CATALOGUE_FIELDS, DETAIL_FIELDS, REST_COUNTRIES_MAX_PAGES, REST_COUNTRIES_PAGE_SIZE } from './apis';
import { type CountryListEnvelope, countryDtoSchema, countryListEnvelopeSchema } from './dto/restCountriesDtos';
import { toCountry } from './mappers';

export interface RestCountriesRepositoryDependencies {
  readonly http: HttpClient;
  /** `null` when the build has no key; every call then fails with `configuration` without a request. */
  readonly apiKey: string | null;
  readonly logger: Logger;
}

const ALPHA_2 = /^[A-Z]{2}$/;

/**
 * Remote country repository over REST Countries v5.
 *
 * - The whole list is fetched in pages of 100 (the free-plan cap) and validated
 *   country by country: a malformed entry is skipped and logged, not fatal.
 * - Responses made with the public demo key carry sample data (always Canada);
 *   they are rejected as a `configuration` error rather than shown as real data.
 * - 401 (bad key) also becomes `configuration`; 429 is retried by the HTTP layer
 *   when `Retry-After` is short, otherwise surfaces as `rateLimited`.
 */
export class RestCountriesRepository implements CountryRepository {
  constructor(private readonly deps: RestCountriesRepositoryDependencies) {}

  async getAll(signal?: AbortSignal): Promise<Result<readonly Country[], AppError>> {
    if (!this.deps.apiKey) return err(missingKey());

    const countries: Country[] = [];
    for (let page = 0; page < REST_COUNTRIES_MAX_PAGES; page++) {
      const result = await this.deps.http.get('', {
        query: {
          limit: REST_COUNTRIES_PAGE_SIZE,
          offset: page * REST_COUNTRIES_PAGE_SIZE,
          response_fields: CATALOGUE_FIELDS,
        },
        schema: countryListEnvelopeSchema,
        signal,
      });
      if (!result.ok) return err(mapError(result.error));

      const parsed = this.parseObjects(result.value.data);
      if (!parsed.ok) return parsed;
      countries.push(...parsed.value);

      const { objects, meta } = result.value.data.data;
      const more = meta?.more ?? objects.length === REST_COUNTRIES_PAGE_SIZE;
      if (!more || objects.length === 0) break;
    }

    // Pages can overlap if the dataset changes mid-fetch; keep the first copy of each country.
    const unique = [...new Map(countries.map((country) => [country.code, country])).values()];
    if (unique.length === 0) return err(new AppError('parse', 'REST Countries returned no countries'));
    return ok(unique);
  }

  async getByCode(code: string, signal?: AbortSignal): Promise<Result<Country, AppError>> {
    if (!this.deps.apiKey) return err(missingKey());
    const normalized = code.trim().toUpperCase();
    if (!ALPHA_2.test(normalized)) return err(new AppError('notFound', `Not a country code: ${code}`));

    const result = await this.deps.http.get(`/codes.alpha_2/${normalized}`, {
      query: { response_fields: DETAIL_FIELDS },
      schema: countryListEnvelopeSchema,
      signal,
    });
    if (!result.ok) return err(mapError(result.error));

    const parsed = this.parseObjects(result.value.data);
    if (!parsed.ok) return parsed;
    const country = parsed.value.find((candidate) => candidate.code === normalized);
    return country ? ok(country) : err(new AppError('notFound', `No country with code ${normalized}`));
  }

  private parseObjects(envelope: CountryListEnvelope): Result<Country[], AppError> {
    const { objects, _demo: demo } = envelope.data;
    if (demo !== null && demo !== undefined) {
      return err(new AppError('configuration', 'REST Countries answered with demo data; a real API key is required'));
    }

    const countries: Country[] = [];
    let skipped = 0;
    for (const object of objects) {
      const parsed = countryDtoSchema.safeParse(object);
      if (parsed.success) countries.push(toCountry(parsed.data));
      else skipped += 1;
    }
    if (skipped > 0) this.deps.logger.warn('Skipped malformed countries', { skipped, received: objects.length });
    if (objects.length > 0 && countries.length === 0) {
      return err(new AppError('parse', 'No country in the response could be read'));
    }
    return ok(countries);
  }
}

function missingKey(): AppError {
  return new AppError('configuration', 'EXPO_PUBLIC_RESTCOUNTRIES_API_KEY is not set');
}

/** A rejected key is a build problem, not something the user can fix by signing in. */
function mapError(error: AppError): AppError {
  return error.kind === 'unauthorized'
    ? new AppError('configuration', 'REST Countries rejected the API key', { cause: error })
    : error;
}
