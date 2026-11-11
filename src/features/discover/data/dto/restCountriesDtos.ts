import { z } from 'zod';

/**
 * REST Countries v5 (https://restcountries.com/docs/countries).
 *
 * The API is incomplete for territories and disputed areas, so every field except
 * the name and alpha-2 code is optional, and each one falls back on its own
 * (`.catch`): one malformed field blanks that field instead of dropping the country.
 */
const optionalString = z.string().trim().min(1).nullish().catch(null);
const optionalNumber = z.number().finite().nonnegative().nullish().catch(null);
const stringList = z.array(z.string()).nullish().catch(null);

export const countryDtoSchema = z.object({
  names: z.object({
    common: z.string().trim().min(1),
    official: optionalString,
    alternates: stringList,
  }),
  codes: z.object({
    alpha_2: z.string().regex(/^[A-Za-z]{2}$/),
    alpha_3: z
      .string()
      .regex(/^[A-Za-z]{3}$/)
      .nullish()
      .catch(null),
  }),
  capitals: z
    .array(
      z.object({
        name: optionalString,
        attributes: z.object({ primary: z.boolean().nullish() }).nullish().catch(null),
      }),
    )
    .nullish()
    .catch(null),
  region: optionalString,
  subregion: optionalString,
  population: optionalNumber,
  area: z.object({ kilometers: optionalNumber }).nullish().catch(null),
  flag: z
    .object({
      url_png: optionalString,
      url_svg: optionalString,
      emoji: optionalString,
      description: optionalString,
    })
    .nullish()
    .catch(null),
  currencies: z
    .array(z.object({ code: z.string().trim().min(1), name: optionalString, symbol: optionalString }))
    .nullish()
    .catch(null),
  languages: z
    .array(z.object({ name: optionalString }))
    .nullish()
    .catch(null),
  coordinates: z.object({ lat: z.number(), lng: z.number() }).nullish().catch(null),
  timezones: stringList,
  borders: stringList,
  calling_codes: stringList,
  cars: z
    .object({ driving_side: z.enum(['left', 'right']).nullish().catch(null) })
    .nullish()
    .catch(null),
  landlocked: z.boolean().nullish().catch(null),
  links: z.object({ wikipedia: optionalString }).nullish().catch(null),
});
export type CountryDto = z.infer<typeof countryDtoSchema>;

/**
 * The envelope only. Objects are validated one by one by the repository, so a
 * single malformed country is skipped instead of failing the whole list.
 *
 * A retired API version answers HTTP 200 with `{ success: false, data: null, errors }`;
 * that fails this schema (no `data.objects`) and surfaces as a `parse` error.
 */
export const countryListEnvelopeSchema = z.object({
  data: z.object({
    objects: z.array(z.unknown()),
    meta: z.object({ total: z.number().nullish(), more: z.boolean().nullish() }).nullish().catch(null),
    /** Present (non-null) only for the public demo key, which returns sample data instead of real results. */
    _demo: z.unknown().nullish(),
  }),
});
export type CountryListEnvelope = z.infer<typeof countryListEnvelopeSchema>;
