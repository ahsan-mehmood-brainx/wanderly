import { z } from 'zod';

/** Overpass API JSON (`[out:json]`). Parsed leniently, element by element. */
export const overpassResponseDtoSchema = z.object({
  elements: z.array(z.unknown()).catch([]),
  remark: z.string().optional(),
});

export type OverpassResponseDto = z.infer<typeof overpassResponseDtoSchema>;

const latLonSchema = z.object({ lat: z.number(), lon: z.number() });

/** One element of `out center`: nodes carry `lat`/`lon`, ways and relations a `center`. */
export const overpassElementDtoSchema = z.object({
  type: z.enum(['node', 'way', 'relation']),
  id: z.number().int(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: latLonSchema.optional(),
  tags: z.record(z.string(), z.string()).optional(),
});

export type OverpassElementDto = z.infer<typeof overpassElementDtoSchema>;
