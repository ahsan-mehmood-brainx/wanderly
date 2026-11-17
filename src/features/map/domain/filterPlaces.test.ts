import { filterPlaces } from './filterPlaces';
import { MAX_NEARBY_PLACES, type Place, PLACE_CATEGORIES, type PlaceCategory } from './Place';

const place = (index: number, category: PlaceCategory, distanceMeters: number): Place => ({
  id: `osm:node/${index}`,
  name: `Place ${index}`,
  category,
  coordinates: { latitude: 48.85 + index / 10_000, longitude: 2.29 },
  distanceMeters,
  address: null,
  openingHours: null,
  website: null,
  phone: null,
});

describe('filterPlaces', () => {
  it('keeps only the selected categories, nearest first', () => {
    const places = [
      place(1, 'restaurants', 900),
      place(2, 'museums', 300),
      place(3, 'parks', 100),
      place(4, 'restaurants', 50),
      place(5, 'hotels', 10),
    ];

    expect(filterPlaces(places, ['restaurants', 'museums']).map((p) => p.id)).toEqual([
      'osm:node/4',
      'osm:node/2',
      'osm:node/1',
    ]);
  });

  it(`shows at most the ${MAX_NEARBY_PLACES} nearest places`, () => {
    const places = Array.from({ length: 120 }, (_, index) =>
      place(index, PLACE_CATEGORIES[index % PLACE_CATEGORIES.length] ?? 'parks', 2_000 - index * 10),
    );

    const shown = filterPlaces(places, [...PLACE_CATEGORIES]);

    expect(shown).toHaveLength(MAX_NEARBY_PLACES);
    expect(shown[0]?.id).toBe('osm:node/119');
    expect(shown.every((p) => p.distanceMeters <= 2_000 - 70 * 10)).toBe(true);
  });

  it('picks the nearest among the selected categories, not among all places', () => {
    const places = [
      ...Array.from({ length: 60 }, (_, index) => place(index, 'restaurants', index)),
      place(100, 'parks', 5_000),
    ];

    expect(filterPlaces(places, ['parks']).map((p) => p.id)).toEqual(['osm:node/100']);
  });

  it('shows nothing with no category selected', () => {
    expect(filterPlaces([place(1, 'parks', 10)], [])).toEqual([]);
  });
});
