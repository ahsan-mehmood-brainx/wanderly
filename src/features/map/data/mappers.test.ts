import {
  ATTRACTION,
  HOTEL,
  LANDMARK,
  LOUVRE_RESULT,
  MAP_CENTER,
  MUSEUM,
  nominatimResult,
  overpassArea,
  overpassNode,
  overpassResponse,
  PARIS_ELEMENTS,
  PARK,
  RESTAURANT,
} from '@/testing/mapFixtures';

import { distanceMeters } from '../domain/geo';
import { nominatimSearchDtoSchema } from './dto/nominatimDtos';
import { overpassResponseDtoSchema } from './dto/overpassDtos';
import { toLocationSearchResults, toPlaces } from './mappers';

const placesFrom = (elements: readonly unknown[], center = MAP_CENTER) =>
  toPlaces(overpassResponseDtoSchema.parse(overpassResponse(elements)), center);

const searchResultsFrom = (results: readonly unknown[]) =>
  toLocationSearchResults(nominatimSearchDtoSchema.parse(results));

describe('toPlaces (Overpass → Place)', () => {
  it('maps a node from lat/lon, keeping its details', () => {
    const [museum] = placesFrom([MUSEUM]);

    expect(museum).toEqual({
      id: 'osm:node/101',
      name: 'Musée du quai Branly',
      category: 'museums',
      coordinates: { latitude: 48.8611, longitude: 2.2978 },
      distanceMeters: expect.any(Number),
      address: expect.any(String),
      openingHours: 'Tu-Su 10:30-19:00',
      website: 'https://www.quaibranly.fr',
      phone: '+33 1 56 61 70 00',
    });
  });

  it('maps ways and relations from their centre', () => {
    const places = placesFrom([
      PARK,
      overpassArea('relation', 7, 48.857, 2.296, { name: 'Hôtel X', tourism: 'hotel' }),
    ]);

    expect(places).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'osm:way/103',
          category: 'parks',
          coordinates: { latitude: 48.8556, longitude: 2.2986 },
        }),
        expect.objectContaining({
          id: 'osm:relation/7',
          category: 'hotels',
          coordinates: { latitude: 48.857, longitude: 2.296 },
        }),
      ]),
    );
  });

  it('builds the address from addr:* tags, and leaves it empty without them', () => {
    const [museum] = placesFrom([MUSEUM]);
    const [restaurant] = placesFrom([RESTAURANT]);

    expect(museum?.address).toContain('37');
    expect(museum?.address).toContain('Quai Jacques Chirac');
    expect(museum?.address).toContain('75007');
    expect(museum?.address).toContain('Paris');
    expect(restaurant).toMatchObject({ address: null, openingHours: null, website: null, phone: null });
  });

  it('classifies every category from the tag table', () => {
    const categories = Object.fromEntries(placesFrom(PARIS_ELEMENTS).map((place) => [place.id, place.category]));

    expect(categories).toEqual({
      'osm:node/101': 'museums',
      'osm:node/102': 'restaurants',
      'osm:way/103': 'parks',
      'osm:node/104': 'hotels',
      'osm:node/105': 'landmarks',
      'osm:node/106': 'attractions',
    });
  });

  it('keeps a website only when it is an http or https URL', () => {
    const places = placesFrom([
      overpassNode(1, 48.8581, 2.2941, { name: 'A', amenity: 'cafe', website: 'http://cafe-a.example' }),
      overpassNode(2, 48.8582, 2.2942, { name: 'B', amenity: 'cafe', website: 'javascript:alert(1)' }),
      overpassNode(3, 48.8583, 2.2943, { name: 'C', amenity: 'cafe', website: 'ftp://cafe-c.example' }),
    ]);

    expect(Object.fromEntries(places.map((place) => [place.name, place.website]))).toEqual({
      A: 'http://cafe-a.example',
      B: null,
      C: null,
    });
  });

  it.each([
    ['no name', overpassNode(1, 48.8581, 2.2941, { amenity: 'cafe' })],
    ['a blank name', overpassNode(2, 48.8581, 2.2941, { name: '  ', amenity: 'cafe' })],
    ['no supported category', overpassNode(3, 48.8581, 2.2941, { name: 'Bakery', shop: 'bakery' })],
    ['no coordinates', { type: 'node', id: 4, tags: { name: 'Nowhere', amenity: 'cafe' } }],
    ['a way without a centre', { type: 'way', id: 5, tags: { name: 'Shapeless', leisure: 'park' } }],
    ['0,0 coordinates', overpassNode(6, 0, 0, { name: 'Null Island', tourism: 'attraction' })],
    ['an out-of-range latitude', overpassNode(7, 95, 2.29, { name: 'Too far north', tourism: 'attraction' })],
    ['no tags', { type: 'node', id: 8, lat: 48.8581, lon: 2.2941 }],
  ])('drops an element with %s', (_label, element) => {
    expect(placesFrom([element, RESTAURANT]).map((place) => place.id)).toEqual(['osm:node/102']);
  });

  it('skips malformed elements without losing the rest of the response', () => {
    const places = placesFrom(['junk', null, { type: 'node', id: 'abc', lat: 'x' }, RESTAURANT, 42]);

    expect(places.map((place) => place.id)).toEqual(['osm:node/102']);
  });

  it('lists an element returned by two category statements once', () => {
    expect(placesFrom([MUSEUM, RESTAURANT, MUSEUM]).map((place) => place.id)).toEqual(['osm:node/102', 'osm:node/101']);
  });

  it('sorts by distance from the centre and gives each place its distance', () => {
    const places = placesFrom([LANDMARK, MUSEUM, ATTRACTION, PARK, HOTEL, RESTAURANT]);

    expect(places.map((place) => place.id)).toEqual([
      'osm:node/102',
      'osm:node/104',
      'osm:way/103',
      'osm:node/101',
      'osm:node/106',
      'osm:node/105',
    ]);
    for (const place of places) {
      expect(place.distanceMeters).toBeCloseTo(distanceMeters(MAP_CENTER, place.coordinates), 0);
    }
    expect(places[0]?.distanceMeters).toBeGreaterThan(30);
    expect(places[0]?.distanceMeters).toBeLessThan(70);
  });

  it('returns no places for an empty area', () => {
    expect(placesFrom([])).toEqual([]);
  });
});

describe('toLocationSearchResults (Nominatim → LocationSearchResult)', () => {
  it('parses string coordinates and splits display_name into a name and a subtitle', () => {
    expect(searchResultsFrom([nominatimResult(), LOUVRE_RESULT])).toEqual([
      {
        id: 'osm:way/5013364',
        name: 'Eiffel Tower',
        subtitle: 'Avenue Anatole France, Paris, France',
        coordinates: { latitude: 48.8582599, longitude: 2.2945006 },
      },
      {
        id: 'osm:relation/7515426',
        name: 'Louvre Museum',
        subtitle: 'Rue de Rivoli, Paris, France',
        coordinates: { latitude: 48.8611473, longitude: 2.3380277 },
      },
    ]);
  });

  it('uses the first part of display_name when the result has no name', () => {
    const [street] = searchResultsFrom([nominatimResult({ name: '', display_name: 'Rue de Rivoli, Paris, France' })]);

    expect(street).toMatchObject({ name: 'Rue de Rivoli', subtitle: 'Paris, France' });
  });

  it.each([
    ['a non-numeric latitude', nominatimResult({ lat: 'abc' })],
    ['0,0', nominatimResult({ lat: '0', lon: '0' })],
    ['an out-of-range latitude', nominatimResult({ lat: '95.1' })],
    ['a missing longitude', nominatimResult({ lon: undefined })],
    ['garbage', 'not a place'],
  ])('drops an entry with %s', (_label, entry) => {
    expect(searchResultsFrom([entry, LOUVRE_RESULT]).map((result) => result.id)).toEqual(['osm:relation/7515426']);
  });

  it('returns nothing when there are no hits', () => {
    expect(searchResultsFrom([])).toEqual([]);
  });
});
