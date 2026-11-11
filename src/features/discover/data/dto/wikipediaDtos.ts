import { z } from 'zod';

const optionalString = z.string().trim().min(1).nullish().catch(null);
const image = z
  .object({ source: z.string().min(1), width: z.number().nullish(), height: z.number().nullish() })
  .nullish()
  .catch(null);

/**
 * `GET /api/rest_v1/page/summary/{title}` (Wikimedia REST API).
 * `type` is `standard` for a normal article and `disambiguation` for a list of meanings.
 */
export const pageSummaryDtoSchema = z.object({
  type: z.string(),
  title: z.string().min(1),
  description: optionalString,
  extract: optionalString,
  thumbnail: image,
  originalimage: image,
  coordinates: z.object({ lat: z.number(), lon: z.number() }).nullish().catch(null),
  content_urls: z
    .object({ mobile: z.object({ page: optionalString }).nullish().catch(null) })
    .nullish()
    .catch(null),
});
export type PageSummaryDto = z.infer<typeof pageSummaryDtoSchema>;

/** `GET /w/rest.php/v1/search/title?q=&limit=` (MediaWiki REST API). Thumbnail URLs are protocol-relative. */
export const titleSearchDtoSchema = z.object({
  pages: z.array(
    z.object({
      title: z.string().min(1),
      description: optionalString,
      thumbnail: z.object({ url: optionalString }).nullish().catch(null),
    }),
  ),
});
export type TitleSearchDto = z.infer<typeof titleSearchDtoSchema>;
