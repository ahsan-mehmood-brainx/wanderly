import {
  NOMINATIM_API,
  NOMINATIM_SEARCH_PATH,
  OVERPASS_API,
  OVERPASS_INTERPRETER_PATH,
} from '@/features/map/data/osmApis';
import { type Coordinates } from '@/features/weather/domain/Coordinates';

import { apiSuccess, type FakeHttpClient, type FakeHttpClientFactory } from './FakeHttpClient';

/** {@link FAKE_MAP_POSITION} rounded to 3 decimals: the centre sent to Overpass for the fake device. */
export const MAP_CENTER: Coordinates = { latitude: 48.858, longitude: 2.294 };

type Tags = Readonly<Record<string, string>>;

/** Overpass wire format for a node. */
export const overpassNode = (id: number, lat: number, lon: number, tags: Tags) => ({
  type: 'node',
  id,
  lat,
  lon,
  tags,
});

/** Overpass wire format for a way or relation (`out center`). */
export const overpassArea = (type: 'way' | 'relation', id: number, lat: number, lon: number, tags: Tags) => ({
  type,
  id,
  center: { lat, lon },
  tags,
});

export const overpassResponse = (elements: readonly unknown[], extra: Record<string, unknown> = {}) => ({
  version: 0.6,
  generator: 'Overpass API 0.7.62.5',
  osm3s: {
    timestamp_osm_base: '2026-11-17T10:00:00Z',
    copyright:
      'The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.',
  },
  elements,
  ...extra,
});

export const MUSEUM = overpassNode(101, 48.8611, 2.2978, {
  name: 'Musée du quai Branly',
  tourism: 'museum',
  'addr:housenumber': '37',
  'addr:street': 'Quai Jacques Chirac',
  'addr:postcode': '75007',
  'addr:city': 'Paris',
  opening_hours: 'Tu-Su 10:30-19:00',
  website: 'https://www.quaibranly.fr',
  phone: '+33 1 56 61 70 00',
});
export const RESTAURANT = overpassNode(102, 48.8583, 2.2945, { name: 'Le Jules Verne', amenity: 'restaurant' });
export const PARK = overpassArea('way', 103, 48.8556, 2.2986, { name: 'Champ de Mars', leisure: 'park' });
export const HOTEL = overpassNode(104, 48.8556, 2.2925, { name: 'Pullman Paris Tour Eiffel', tourism: 'hotel' });
export const LANDMARK = overpassNode(105, 48.8642, 2.301, { name: 'Flamme de la Liberté', historic: 'memorial' });
export const ATTRACTION = overpassNode(106, 48.8616, 2.2893, { name: 'Trocadéro viewpoint', tourism: 'viewpoint' });

/** One of each category around {@link MAP_CENTER}. */
export const PARIS_ELEMENTS = [MUSEUM, RESTAURANT, PARK, HOTEL, LANDMARK, ATTRACTION];

/** Nominatim `format=jsonv2` wire format. */
export const nominatimResult = (overrides: Record<string, unknown> = {}) => ({
  place_id: 88066702,
  licence: 'Data © OpenStreetMap contributors, ODbL 1.0. http://osm.org/copyright',
  osm_type: 'way',
  osm_id: 5013364,
  lat: '48.8582599',
  lon: '2.2945006',
  category: 'man_made',
  type: 'tower',
  place_rank: 30,
  importance: 0.6205937724353116,
  addresstype: 'man_made',
  name: 'Eiffel Tower',
  display_name: 'Eiffel Tower, Avenue Anatole France, Paris, France',
  boundingbox: ['48.8574753', '48.8590453', '2.2933119', '2.2956897'],
  ...overrides,
});

export const LOUVRE_RESULT = nominatimResult({
  place_id: 1,
  osm_type: 'relation',
  osm_id: 7515426,
  lat: '48.8611473',
  lon: '2.3380277',
  category: 'tourism',
  type: 'museum',
  name: 'Louvre Museum',
  display_name: 'Louvre Museum, Rue de Rivoli, Paris, France',
});

/** Scripts Overpass on a fake factory: every query answers with `elements` (default {@link PARIS_ELEMENTS}). */
export function stubOverpass(factory: FakeHttpClientFactory, elements: readonly unknown[] = PARIS_ELEMENTS) {
  const client: FakeHttpClient = factory.client(OVERPASS_API.name);
  client.on('GET', OVERPASS_INTERPRETER_PATH, apiSuccess(overpassResponse(elements)));
  return client;
}

/** Scripts Nominatim on a fake factory: every search answers with `results` (default: the Louvre). */
export function stubNominatim(factory: FakeHttpClientFactory, results: readonly unknown[] = [LOUVRE_RESULT]) {
  const client: FakeHttpClient = factory.client(NOMINATIM_API.name);
  client.on('GET', NOMINATIM_SEARCH_PATH, apiSuccess(results));
  return client;
}
