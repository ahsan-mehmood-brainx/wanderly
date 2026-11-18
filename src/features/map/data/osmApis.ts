import { type ApiDefinition, noRetry } from '@/core/http';

/**
 * OpenStreetMap services. Both are run by volunteers and ask apps to identify
 * themselves, keep request rates low and cache results (Nominatim: at most 1
 * request per second and no autocomplete; Overpass: fair use, one query at a time).
 *
 * No HTTP-level retry: a retry would run inside one `RequestThrottle` task, so it
 * would skip the minimum spacing and answer a 429 before the cooldown is set.
 * Retrying is left to the user (Try again, or the refetch when back online), which
 * goes through the throttle.
 */
export const OSM_USER_AGENT = 'Wanderly/1.0 (com.wanderly.app)';

export const NOMINATIM_API: ApiDefinition = {
  name: 'nominatim',
  baseUrl: 'https://nominatim.openstreetmap.org',
  timeoutMs: 10_000,
  headers: { 'User-Agent': OSM_USER_AGENT },
  retry: noRetry,
};

export const OVERPASS_API: ApiDefinition = {
  name: 'overpass',
  baseUrl: 'https://overpass-api.de/api',
  timeoutMs: 30_000,
  headers: { 'User-Agent': OSM_USER_AGENT },
  retry: noRetry,
};

export const NOMINATIM_SEARCH_PATH = '/search';
export const OVERPASS_INTERPRETER_PATH = '/interpreter';
