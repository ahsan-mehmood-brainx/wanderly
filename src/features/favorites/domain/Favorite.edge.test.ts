import {
  type CountryDestinationDetails,
  essentialsOf,
  type PlaceDestinationDetails,
} from '@/features/discover/domain/Destination';
import { type Place } from '@/features/map/domain/Place';
import { countryByCode, placeSummary } from '@/testing/discoverFixtures';

import { compareCollections, type Collection } from './Collection';
import { compareFavorites, type Favorite, favoriteTargetFromDestination, favoriteTargetFromPlace } from './Favorite';

const portugal = countryByCode('PT');

const countryDetails = (id: string, coordinates = portugal.coordinates): CountryDestinationDetails => {
  const country = { ...portugal, coordinates };
  return {
    kind: 'country',
    id,
    country,
    description: { status: 'missing' },
    neighbours: [],
    essentials: essentialsOf(country),
  };
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

describe('favoriteTargetFromDestination edge cases', () => {
  it.each(['country-PT', 'country-Pt', 'country-pt'])(
    'AC1 saves a country opened as %s under one target, country-pt, so a deep link cannot save it twice',
    (id) => {
      expect(favoriteTargetFromDestination(countryDetails(id)).targetId).toBe('country-pt');
    },
  );

  it('keeps no position for a country without a reference point, rather than a half position', () => {
    const target = favoriteTargetFromDestination(countryDetails('country-pt', null));

    expect(target.latitude).toBeNull();
    expect(target.longitude).toBeNull();
  });

  it('keeps no image or position for a place whose description failed to load', () => {
    const details: PlaceDestinationDetails = {
      kind: 'place',
      id: 'kyoto',
      name: 'Kyoto',
      description: { status: 'failed', errorKind: 'network' },
      categories: [],
      country: null,
      essentials: null,
    };

    expect(favoriteTargetFromDestination(details)).toEqual({
      targetId: 'kyoto',
      category: 'destination',
      name: 'Kyoto',
      subtitle: null,
      imageUrl: null,
      flagEmoji: null,
      latitude: null,
      longitude: null,
      address: null,
    });
  });

  it('prefers the thumbnail over the full image for a saved destination', () => {
    const details: PlaceDestinationDetails = {
      kind: 'city',
      id: 'kyoto',
      name: 'Kyoto',
      description: {
        status: 'available',
        summary: placeSummary('Kyoto', { thumbnailUrl: 'thumb.jpg', imageUrl: 'full.jpg' }),
      },
      categories: [],
      country: null,
      essentials: null,
    };

    expect(favoriteTargetFromDestination(details).imageUrl).toBe('thumb.jpg');
  });
});

describe('favoriteTargetFromPlace edge cases', () => {
  it.each([
    ['museums', 'attraction'],
    ['parks', 'attraction'],
    ['landmarks', 'landmark'],
  ] as const)('saves a %s place as %s', (category, expected) => {
    expect(favoriteTargetFromPlace(place({ category }))?.category).toBe(expected);
  });

  it('keeps a place without an address with no subtitle and no address', () => {
    const target = favoriteTargetFromPlace(place({ address: null }));

    expect(target?.subtitle).toBeNull();
    expect(target?.address).toBeNull();
  });
});

describe('ordering edge cases', () => {
  const saved = (id: string, savedAt: number) => ({ id, savedAt }) as Favorite;

  it('orders favorites saved in the same millisecond by id, so the list never jumps', () => {
    const list = [saved('b', 5), saved('a', 5), saved('c', 9)].sort(compareFavorites);

    expect(list.map(({ id }) => id)).toEqual(['c', 'a', 'b']);
  });

  it('keeps default collections first even when a custom one is older', () => {
    const custom: Collection = {
      id: 'old',
      kind: 'custom',
      defaultKey: null,
      name: 'Old',
      createdAt: 1,
      updatedAt: 1,
    };
    const mustVisit: Collection = {
      id: 'must-visit',
      kind: 'default',
      defaultKey: 'mustVisit',
      name: null,
      createdAt: 1_000,
      updatedAt: 1_000,
    };
    const wantToVisit: Collection = { ...mustVisit, id: 'want-to-visit', defaultKey: 'wantToVisit' };

    expect([custom, mustVisit, wantToVisit].sort(compareCollections).map(({ id }) => id)).toEqual([
      'want-to-visit',
      'must-visit',
      'old',
    ]);
  });
});
