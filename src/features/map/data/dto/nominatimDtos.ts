import { z } from 'zod';

/** Nominatim `/search?format=jsonv2`. Parsed leniently, entry by entry. */
export const nominatimSearchDtoSchema = z.array(z.unknown());

export type NominatimSearchDto = z.infer<typeof nominatimSearchDtoSchema>;

/** One search hit. Nominatim sends coordinates as strings. */
export const nominatimResultDtoSchema = z.object({
  osm_type: z.string().min(1),
  osm_id: z.number().int(),
  lat: z.union([z.string(), z.number()]),
  lon: z.union([z.string(), z.number()]),
  name: z.string().optional(),
  display_name: z.string(),
});

export type NominatimResultDto = z.infer<typeof nominatimResultDtoSchema>;
