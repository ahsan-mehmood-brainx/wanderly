import { buildOverpassQuery, categoryForTags } from './overpassQuery';

const CENTER = { latitude: 48.858, longitude: 2.294 };

const statements = (query: string) =>
  query
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

describe('buildOverpassQuery', () => {
  it('asks for JSON with a 25 s server timeout', () => {
    expect(buildOverpassQuery(CENTER).trimStart().startsWith('[out:json][timeout:25]')).toBe(true);
  });

  it('searches 1.5 km around the centre in every statement, for named elements only', () => {
    const query = buildOverpassQuery(CENTER);
    const around = statements(query).filter((statement) => statement.includes('around:'));

    expect(around.length).toBeGreaterThanOrEqual(6);
    for (const statement of around) {
      expect(statement).toContain('around:1500,48.858,2.294');
      expect(statement).toMatch(/\[\s*"?name"?\s*\]/);
    }
    expect(query.match(/around:/g)).toHaveLength(around.length);
  });

  it('caps every category at 40 elements, with centres for ways and relations', () => {
    expect(buildOverpassQuery(CENTER).match(/out center 40/g)).toHaveLength(6);
  });

  it.each([
    ['attractions', ['tourism', 'attraction', 'viewpoint', 'zoo', 'theme_park']],
    ['restaurants', ['amenity', 'restaurant', 'cafe', 'fast_food']],
    ['hotels', ['tourism', 'hotel', 'hostel', 'guest_house', 'motel']],
    ['museums', ['tourism', 'museum', 'gallery']],
    ['parks', ['leisure', 'park', 'garden', 'nature_reserve']],
    [
      'landmarks',
      ['historic', 'monument', 'memorial', 'castle', 'ruins', 'archaeological_site', 'fort', 'man_made', 'lighthouse'],
    ],
  ])('includes the %s tags', (_category, words) => {
    const query = buildOverpassQuery(CENTER);
    for (const word of words) expect(query).toContain(word);
  });

  it('uses the rounded centre it is given', () => {
    expect(buildOverpassQuery({ latitude: -33.857, longitude: 151.215 })).toContain('around:1500,-33.857,151.215');
  });
});

describe('categoryForTags', () => {
  it.each([
    [{ tourism: 'attraction' }, 'attractions'],
    [{ tourism: 'viewpoint' }, 'attractions'],
    [{ tourism: 'zoo' }, 'attractions'],
    [{ tourism: 'theme_park' }, 'attractions'],
    [{ amenity: 'restaurant' }, 'restaurants'],
    [{ amenity: 'cafe' }, 'restaurants'],
    [{ amenity: 'fast_food' }, 'restaurants'],
    [{ tourism: 'hotel' }, 'hotels'],
    [{ tourism: 'hostel' }, 'hotels'],
    [{ tourism: 'guest_house' }, 'hotels'],
    [{ tourism: 'motel' }, 'hotels'],
    [{ tourism: 'museum' }, 'museums'],
    [{ tourism: 'gallery' }, 'museums'],
    [{ leisure: 'park' }, 'parks'],
    [{ leisure: 'garden' }, 'parks'],
    [{ leisure: 'nature_reserve' }, 'parks'],
    [{ historic: 'monument' }, 'landmarks'],
    [{ historic: 'memorial' }, 'landmarks'],
    [{ historic: 'castle' }, 'landmarks'],
    [{ historic: 'ruins' }, 'landmarks'],
    [{ historic: 'archaeological_site' }, 'landmarks'],
    [{ historic: 'fort' }, 'landmarks'],
    [{ man_made: 'lighthouse' }, 'landmarks'],
  ])('%j is %s', (tags, category) => {
    expect(categoryForTags(tags)).toBe(category);
  });

  it.each([[{ shop: 'bakery' }], [{ amenity: 'bank' }], [{ historic: 'yes' }], [{}]])(
    '%j has no supported category',
    (tags) => {
      expect(categoryForTags(tags)).toBeNull();
    },
  );

  it.each([
    [{ tourism: 'museum', historic: 'castle' }, 'museums'],
    [{ tourism: 'hotel', amenity: 'restaurant' }, 'hotels'],
    [{ amenity: 'restaurant', leisure: 'park' }, 'restaurants'],
    [{ leisure: 'park', historic: 'monument' }, 'parks'],
    [{ tourism: 'attraction', historic: 'castle' }, 'landmarks'],
    [{ tourism: 'viewpoint', man_made: 'lighthouse' }, 'landmarks'],
  ])(
    'applies the precedence museum > hotel > restaurant > park > landmark > attraction: %j is %s',
    (tags, category) => {
      expect(categoryForTags(tags)).toBe(category);
    },
  );
});
