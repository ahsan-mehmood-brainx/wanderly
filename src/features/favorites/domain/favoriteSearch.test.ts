import { favorite, restaurantFavorite } from '@/testing/favoritesFixtures';

import { type Favorite } from './Favorite';
import { filterFavorites } from './favoriteSearch';

const saoPaulo = favorite({
  id: 'sao-paulo',
  targetId: 'sao-paulo',
  name: 'São Paulo',
  subtitle: 'Brazil',
  savedAt: 1,
});
const portugal = favorite({
  id: 'portugal',
  targetId: 'country-pt',
  category: 'country',
  name: 'Portugal',
  subtitle: 'Europe',
  savedAt: 2,
});
const lisbon = favorite({ id: 'lisbon', name: 'Lisbon', subtitle: 'Portugal', savedAt: 3 });
const flamme = favorite({
  id: 'flamme',
  targetId: 'osm:node/105',
  category: 'landmark',
  name: 'Flamme de la Liberté',
  subtitle: "Place de l'Alma",
  address: "Place de l'Alma",
  savedAt: 4,
});
const julesVerne = restaurantFavorite({ id: 'jules-verne', savedAt: 5 });
const branly = favorite({
  id: 'branly',
  targetId: 'osm:node/101',
  category: 'attraction',
  name: 'Musée du quai Branly',
  subtitle: null,
  address: '37 Quai Jacques Chirac, Paris',
  savedAt: 6,
});

const all: readonly Favorite[] = [saoPaulo, portugal, lisbon, flamme, julesVerne, branly];
const ids = (favorites: readonly Favorite[]) => favorites.map(({ id }) => id);

describe('filterFavorites', () => {
  it('AC7 returns everything, newest first, with no query and every category', () => {
    expect(ids(filterFavorites(all, { query: '', category: 'all' }))).toEqual([
      'branly',
      'jules-verne',
      'flamme',
      'lisbon',
      'portugal',
      'sao-paulo',
    ]);
  });

  it.each(['sao', 'SÃO', 'paulo', ' São  '])('AC7 matches the name ignoring case and accents (%s)', (query) => {
    expect(ids(filterFavorites(all, { query, category: 'all' }))).toEqual(['sao-paulo']);
  });

  it('AC7 matches the subtitle (country)', () => {
    expect(ids(filterFavorites(all, { query: 'portugal', category: 'all' }))).toEqual(['lisbon', 'portugal']);
  });

  it('AC7 matches the address of a map place', () => {
    expect(ids(filterFavorites(all, { query: 'quai jacques', category: 'all' }))).toEqual(['branly']);
  });

  it('AC7 filters by category', () => {
    expect(ids(filterFavorites(all, { query: '', category: 'restaurant' }))).toEqual(['jules-verne']);
    expect(ids(filterFavorites(all, { query: '', category: 'destination' }))).toEqual(['lisbon', 'sao-paulo']);
    expect(ids(filterFavorites(all, { query: '', category: 'country' }))).toEqual(['portugal']);
    expect(ids(filterFavorites(all, { query: '', category: 'landmark' }))).toEqual(['flamme']);
  });

  it('AC7 combines the search and the category', () => {
    expect(ids(filterFavorites(all, { query: 'paris', category: 'attraction' }))).toEqual(['branly']);
    expect(ids(filterFavorites(all, { query: 'paris', category: 'all' }))).toEqual(['branly', 'jules-verne']);
    expect(ids(filterFavorites(all, { query: 'lisbon', category: 'restaurant' }))).toEqual([]);
  });

  it('AC7 returns nothing when nothing matches', () => {
    expect(filterFavorites(all, { query: 'zzqx', category: 'all' })).toEqual([]);
  });

  it('AC7 does not reorder the list it was given', () => {
    const given = [...all];
    filterFavorites(given, { query: '', category: 'all' });
    expect(given).toEqual(all);
  });
});
