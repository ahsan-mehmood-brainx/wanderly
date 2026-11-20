import {
  type CountryDestinationDetails,
  essentialsOf,
  type PlaceDestinationDetails,
} from '@/features/discover/domain/Destination';
import { type Place, type PlaceCategory } from '@/features/map/domain/Place';
import { countryByCode, placeSummary } from '@/testing/discoverFixtures';

import { type FavoriteCategory, favoriteTargetFromDestination, favoriteTargetFromPlace } from './Favorite';

const portugal = countryByCode('PT');
const japan = countryByCode('JP');

const portugalDetails: CountryDestinationDetails = {
  kind: 'country',
  id: 'country-pt',
  country: portugal,
  description: { status: 'missing' },
  neighbours: [],
  essentials: essentialsOf(portugal),
};

const kyotoDetails: PlaceDestinationDetails = {
  kind: 'city',
  id: 'kyoto',
  name: 'Kyoto',
  description: {
    status: 'available',
    summary: placeSummary('Kyoto', { coordinates: { latitude: 35.0116, longitude: 135.768 } }),
  },
  categories: ['city', 'culture'],
  country: japan,
  essentials: essentialsOf(japan),
};

function place(overrides: Partial<Place> = {}): Place {
  return {
    id: 'osm:node/102',
    name: 'Le Jules Verne',
    category: 'restaurants',
    coordinates: { latitude: 48.8583, longitude: 2.2945 },
    distanceMeters: 120,
    address: 'Avenue Gustave Eiffel, Paris',
    openingHours: null,
    website: null,
    phone: null,
    ...overrides,
  };
}

describe('favoriteTargetFromDestination', () => {
  it('AC2 saves a country as category country, with its flag and reference point', () => {
    expect(favoriteTargetFromDestination(portugalDetails)).toEqual(
      expect.objectContaining({
        targetId: 'country-pt',
        category: 'country',
        name: 'Portugal',
        imageUrl: portugal.flag.pngUrl,
        flagEmoji: portugal.flag.emoji,
        latitude: 1,
        longitude: 2,
        address: null,
      }),
    );
  });

  it('AC2 saves a city as category destination, with its host country as subtitle', () => {
    expect(favoriteTargetFromDestination(kyotoDetails)).toEqual({
      targetId: 'kyoto',
      category: 'destination',
      name: 'Kyoto',
      subtitle: 'Japan',
      imageUrl: expect.stringContaining('upload.wikimedia.org/Kyoto'),
      flagEmoji: japan.flag.emoji,
      latitude: 35.0116,
      longitude: 135.768,
      address: null,
    });
  });

  it('AC2 saves a place of unknown country, with no description, without inventing data', () => {
    const target = favoriteTargetFromDestination({
      kind: 'place',
      id: 'place-nowhere',
      name: 'Nowhere Special',
      description: { status: 'missing' },
      categories: [],
      country: null,
      essentials: null,
    });

    expect(target).toEqual({
      targetId: 'place-nowhere',
      category: 'destination',
      name: 'Nowhere Special',
      subtitle: null,
      imageUrl: null,
      flagEmoji: null,
      latitude: null,
      longitude: null,
      address: null,
    });
  });
});

describe('favoriteTargetFromPlace', () => {
  it.each<[PlaceCategory, FavoriteCategory]>([
    ['attractions', 'attraction'],
    ['museums', 'attraction'],
    ['parks', 'attraction'],
    ['restaurants', 'restaurant'],
    ['landmarks', 'landmark'],
  ])('AC2 saves a map place of type %s as %s', (placeCategory, expected) => {
    expect(favoriteTargetFromPlace(place({ category: placeCategory }))?.category).toBe(expected);
  });

  it('AC2 keeps the place id, name, address and position as the snapshot', () => {
    expect(favoriteTargetFromPlace(place())).toEqual({
      targetId: 'osm:node/102',
      category: 'restaurant',
      name: 'Le Jules Verne',
      subtitle: 'Avenue Gustave Eiffel, Paris',
      imageUrl: null,
      flagEmoji: null,
      latitude: 48.8583,
      longitude: 2.2945,
      address: 'Avenue Gustave Eiffel, Paris',
    });
  });

  it('AC2 has no subtitle for a place without an address', () => {
    expect(favoriteTargetFromPlace(place({ address: null }))).toMatchObject({ subtitle: null, address: null });
  });

  it('AC2 refuses hotels, which have no saved-place category', () => {
    expect(favoriteTargetFromPlace(place({ category: 'hotels' }))).toBeNull();
  });
});
