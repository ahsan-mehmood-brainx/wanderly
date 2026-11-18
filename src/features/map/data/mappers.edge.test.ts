import { MAP_CENTER, nominatimResult, overpassArea, overpassNode, overpassResponse } from '@/testing/mapFixtures';

import { overpassResponseDtoSchema } from './dto/overpassDtos';
import { toLocationSearchResults, toPlaces } from './mappers';

const places = (elements: readonly unknown[]) =>
  toPlaces(overpassResponseDtoSchema.parse(overpassResponse(elements)), MAP_CENTER);

describe('toPlaces edge cases', () => {
  it('treats a response whose elements field is missing or not a list as no places', () => {
    expect(toPlaces(overpassResponseDtoSchema.parse({ elements: null }), MAP_CENTER)).toEqual([]);
    expect(toPlaces(overpassResponseDtoSchema.parse({}), MAP_CENTER)).toEqual([]);
  });

  it('drops a way without a centre and a node that only has a centre', () => {
    const wayWithoutCenter = { type: 'way', id: 1, tags: { name: 'Park', leisure: 'park' } };
    const nodeWithCenter = {
      type: 'node',
      id: 2,
      center: { lat: 48.86, lon: 2.3 },
      tags: { name: 'Cafe', amenity: 'cafe' },
    };

    expect(places([wayWithoutCenter, nodeWithCenter])).toEqual([]);
  });

  it('drops an element whose name is only whitespace', () => {
    expect(places([overpassNode(1, 48.86, 2.3, { name: '   ', amenity: 'cafe' })])).toEqual([]);
  });

  it('keeps a node and a way that share the same numeric id as two places', () => {
    const result = places([
      overpassNode(7, 48.86, 2.3, { name: 'Cafe', amenity: 'cafe' }),
      overpassArea('way', 7, 48.861, 2.301, { name: 'Garden', leisure: 'garden' }),
    ]);

    expect(result.map((place) => place.id).sort()).toEqual(['osm:node/7', 'osm:way/7']);
  });

  it('keeps only web links as websites, and falls back to contact:website', () => {
    const [unsafe, spaced, upper, contact] = [
      overpassNode(1, 48.861, 2.3, { name: 'A', amenity: 'cafe', website: 'javascript:alert(1)' }),
      overpassNode(2, 48.862, 2.3, { name: 'B', amenity: 'cafe', website: 'https://example.com/a b' }),
      overpassNode(3, 48.863, 2.3, { name: 'C', amenity: 'cafe', website: 'HTTPS://EXAMPLE.COM' }),
      overpassNode(4, 48.864, 2.3, { name: 'D', amenity: 'cafe', 'contact:website': 'https://d.example' }),
    ];
    const byId = new Map(places([unsafe, spaced, upper, contact]).map((place) => [place.id, place]));

    expect(byId.get('osm:node/1')?.website).toBeNull();
    expect(byId.get('osm:node/2')?.website).toBeNull();
    expect(byId.get('osm:node/3')?.website).toBe('HTTPS://EXAMPLE.COM');
    expect(byId.get('osm:node/4')?.website).toBe('https://d.example');
  });

  it('builds a partial address from whichever addr:* tags exist, preferring addr:full', () => {
    const [cityOnly, full, none] = places([
      overpassNode(1, 48.861, 2.3, { name: 'A', amenity: 'cafe', 'addr:city': 'Paris' }),
      overpassNode(2, 48.862, 2.3, {
        name: 'B',
        amenity: 'cafe',
        'addr:full': '1 Rue X, Paris',
        'addr:street': 'Ignored',
      }),
      overpassNode(3, 48.863, 2.3, { name: 'C', amenity: 'cafe' }),
    ]).sort((a, b) => a.id.localeCompare(b.id));

    expect(cityOnly?.address).toBe('Paris');
    expect(full?.address).toBe('1 Rue X, Paris');
    expect(none?.address).toBeNull();
  });

  it('accepts places on the equator or prime meridian, and only drops exactly 0,0', () => {
    const result = places([
      overpassNode(1, 0, 9.45, { name: 'Equator', tourism: 'attraction' }),
      overpassNode(2, 51.4779, 0, { name: 'Meridian', historic: 'monument' }),
      overpassNode(3, 0, 0, { name: 'Null Island', tourism: 'attraction' }),
    ]);

    expect(result.map((place) => place.name).sort()).toEqual(['Equator', 'Meridian']);
  });
});

describe('toLocationSearchResults edge cases', () => {
  it('uses the first part of display_name when the name is empty', () => {
    const [result] = toLocationSearchResults([
      nominatimResult({ name: '', display_name: 'Rue de Rivoli, Paris, France' }),
    ]);

    expect(result).toMatchObject({ name: 'Rue de Rivoli', subtitle: 'Paris, France' });
  });

  it('keeps the whole display_name as subtitle when the name differs from its first part', () => {
    const [result] = toLocationSearchResults([
      nominatimResult({ name: 'Eiffel Tower', display_name: 'Tour Eiffel, Paris, France' }),
    ]);

    expect(result).toMatchObject({ name: 'Eiffel Tower', subtitle: 'Tour Eiffel, Paris, France' });
  });

  it('has no subtitle when display_name is just the name', () => {
    const [result] = toLocationSearchResults([nominatimResult({ name: 'France', display_name: 'France' })]);

    expect(result?.subtitle).toBeNull();
  });

  it('accepts numeric coordinates and drops empty or non-numeric strings', () => {
    const results = toLocationSearchResults([
      nominatimResult({ osm_id: 1, lat: 48.85, lon: 2.35 }),
      nominatimResult({ osm_id: 2, lat: '', lon: '2.35' }),
      nominatimResult({ osm_id: 3, lat: 'north', lon: '2.35' }),
      nominatimResult({ osm_id: 4, lat: '  ', lon: '2.35' }),
    ]);

    expect(results.map((result) => result.id)).toEqual(['osm:way/1']);
    expect(results[0]?.coordinates).toEqual({ latitude: 48.85, longitude: 2.35 });
  });

  it('drops a hit with no name and an empty display_name', () => {
    expect(toLocationSearchResults([nominatimResult({ name: '', display_name: ' , ' })])).toEqual([]);
  });
});
