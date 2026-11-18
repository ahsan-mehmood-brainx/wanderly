import { type ApiDefinition, BearerTokenAuth } from '@/core/http';

/**
 * REST Countries v5. Free accounts need an API key (https://restcountries.com/sign-up),
 * may request at most 100 objects per page, and are rate limited to 20 requests per
 * 10 seconds. v3.1 and earlier are retired: they answer HTTP 200 with an error body.
 *
 * The key ships in the app bundle, so it is public: use a key meant for client apps.
 * On web, also add the site's origin to the key's allowed origins.
 */
export const REST_COUNTRIES_BASE_URL = 'https://api.restcountries.com/countries/v5';

/** Read at build time (Expo inlines `EXPO_PUBLIC_*`). `null` when unset. */
export function readRestCountriesApiKey(): string | null {
  return process.env.EXPO_PUBLIC_RESTCOUNTRIES_API_KEY?.trim() || null;
}

export function restCountriesApi(apiKey: string | null): ApiDefinition {
  return {
    name: 'restcountries',
    baseUrl: REST_COUNTRIES_BASE_URL,
    timeoutMs: 15_000,
    auth: new BearerTokenAuth(() => apiKey),
  };
}

/** Free-plan page size cap. */
export const REST_COUNTRIES_PAGE_SIZE = 100;
/** About 250 countries exist; this only stops a misbehaving `more` flag from looping. */
export const REST_COUNTRIES_MAX_PAGES = 5;

/** Fields for search, filters, cards and recommendations. Keeps the catalogue small (no translations, colours). */
export const CATALOGUE_FIELDS = [
  'names.common',
  'names.official',
  'names.alternates',
  'codes.alpha_2',
  'codes.alpha_3',
  'capitals',
  'region',
  'subregion',
  'population',
  'flag.url_png',
  'flag.emoji',
  'flag.description',
  'currencies',
  'languages',
].join(',');

/** Everything the destination screen shows. */
export const DETAIL_FIELDS = [
  CATALOGUE_FIELDS,
  'flag.url_svg',
  'area.kilometers',
  'coordinates',
  'timezones',
  'borders',
  'calling_codes',
  'cars.driving_side',
  'landlocked',
  'links.wikipedia',
].join(',');

/**
 * English Wikipedia: the Wikimedia REST API for page summaries and the MediaWiki
 * REST API for title search. Content is CC BY-SA 4.0 and must be attributed.
 * Wikimedia asks clients to identify themselves; browsers can't set `User-Agent`,
 * so the CORS-safelisted `Api-User-Agent` header is used everywhere.
 */
export const WIKIPEDIA_API: ApiDefinition = {
  name: 'wikipedia',
  baseUrl: 'https://en.wikipedia.org',
  timeoutMs: 10_000,
  headers: { 'Api-User-Agent': 'Wanderly/1.0 (React Native travel app)' },
};

export const WIKIPEDIA_SEARCH_TIMEOUT_MS = 8_000;
