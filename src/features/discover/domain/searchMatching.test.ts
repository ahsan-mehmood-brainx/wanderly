import { countryByCode, WORLD } from '@/testing/discoverFixtures';

import { placeDestinationId } from './DestinationId';
import { CURATED_DESTINATIONS } from './editorial';
import {
  categoriesFromDescription,
  countryToSummary,
  inferCountry,
  isPlaceDescription,
  matchCountriesAndCapitals,
  matchCurated,
  matchScore,
  normalizeText,
  placeHitToSummary,
  rankResults,
} from './searchMatching';

describe('normalizeText', () => {
  it('ignores case, accents and punctuation but keeps every script', () => {
    expect(normalizeText('  São-Tomé, Príncipe! ')).toBe('sao tome principe');
    expect(normalizeText('Reykjavík')).toBe('reykjavik');
    expect(normalizeText('東京')).toBe('東京');
  });
});

describe('matchScore', () => {
  it('ranks exact > prefix > word prefix > substring', () => {
    expect(matchScore('iceland', 'Iceland')).toBeGreaterThan(matchScore('ice', 'Iceland'));
    expect(matchScore('ice', 'Iceland')).toBeGreaterThan(matchScore('city', 'Mexico City'));
    expect(matchScore('city', 'Mexico City')).toBeGreaterThan(matchScore('xic', 'Mexico'));
    expect(matchScore('xic', 'Mexico')).toBeGreaterThan(0);
  });

  it('does not substring-match very short queries', () => {
    expect(matchScore('ex', 'Mexico')).toBe(0);
    expect(matchScore('', 'Mexico')).toBe(0);
  });
});

describe('matchCountriesAndCapitals', () => {
  const names = (query: string) =>
    matchCountriesAndCapitals(normalizeText(query), WORLD).map(
      ({ destination }) => `${destination.kind}:${destination.name}`,
    );

  it('finds countries by name, official name and code, and capitals as cities', () => {
    expect(names('portugal')).toEqual(['country:Portugal']);
    expect(names('republic of japan')).toEqual(['country:Japan']);
    expect(names('jpn')).toEqual(['country:Japan']);
    expect(names('lisbon')).toEqual(['city:Lisbon']);
    expect(names('reykjavik')).toEqual(['city:Reykjavík']);
  });

  it('marks capitals and links them to their country', () => {
    const [lisbon] = matchCountriesAndCapitals('lisbon', WORLD);
    expect(lisbon?.destination).toMatchObject({
      kind: 'city',
      isCapital: true,
      countryCode: 'PT',
      countryName: 'Portugal',
      id: placeDestinationId('Lisbon', 'PT'),
    });
  });
});

describe('Wikipedia hit classification', () => {
  it.each([
    ['City in the Kansai region of Japan', true],
    ['Greek island in the Aegean Sea', true],
    ['National park in Alberta, Canada', true],
    ['15th-century Inca citadel in Peru', true],
    ['1997 international treaty to reduce greenhouse gas emissions', false],
    ['Japanese association football club', false],
    ['2003 film by Sofia Coppola', false],
    [null, false],
  ])('%j is a place: %s', (description, expected) => {
    expect(isPlaceDescription(description)).toBe(expected);
  });

  it('derives categories from the description', () => {
    expect(categoriesFromDescription('Greek island in the Aegean Sea')).toEqual(['island']);
    expect(categoriesFromDescription('Mountain range in the Italian Alps')).toEqual(['mountains']);
    expect(categoriesFromDescription('City in Portugal')).toEqual(['city']);
  });

  it('infers the host country, preferring the longest name and refusing to guess on a tie', () => {
    expect(inferCountry('City in the Kansai region of Japan', WORLD)?.code).toBe('JP');
    expect(inferCountry('Capital and the largest city of Georgia (country)', WORLD)?.code).toBe('GE');
    expect(inferCountry('A town somewhere', WORLD)).toBeNull();
    expect(inferCountry('Border town between Spain and France', WORLD)?.code).toBe('FR');
    expect(inferCountry('Trade route between Spain and Japan', WORLD)).toBeNull();
  });

  it('turns place hits into destinations and drops non-places', () => {
    const kyoto = placeHitToSummary(
      { title: 'Kyoto', description: 'City in the Kansai region of Japan', thumbnailUrl: 'https://x/kyoto.jpg' },
      WORLD,
      0,
    );
    expect(kyoto?.destination).toMatchObject({
      kind: 'city',
      name: 'Kyoto',
      countryCode: 'JP',
      imageUrl: 'https://x/kyoto.jpg',
      categories: ['city'],
    });
    expect(
      placeHitToSummary({ title: 'Kyoto Protocol', description: 'International treaty', thumbnailUrl: null }, WORLD, 1),
    ).toBeNull();
  });
});

describe('rankResults', () => {
  it('merges duplicates, keeping the best score and filling in missing details', () => {
    const capital = matchCountriesAndCapitals('lisbon', WORLD);
    const wikipedia = [
      placeHitToSummary(
        { title: 'Lisbon', description: 'Capital city of Portugal', thumbnailUrl: 'https://x/l.jpg' },
        WORLD,
        0,
      )!,
    ];

    const [lisbon, ...rest] = rankResults(capital, wikipedia);

    expect(rest).toHaveLength(0);
    expect(lisbon).toMatchObject({ name: 'Lisbon', isCapital: true, imageUrl: 'https://x/l.jpg' });
  });

  it('keeps capital status when a curated copy outranks the capital', () => {
    const capital = matchCountriesAndCapitals('lisbon', WORLD);
    const curated = matchCurated('lisbon', CURATED_DESTINATIONS, new Map(WORLD.map((c) => [c.code, c])));

    const [lisbon, ...rest] = rankResults(capital, curated);

    expect(rest).toHaveLength(0);
    expect(lisbon).toMatchObject({ id: 'lisbon', isCapital: true, categories: ['city', 'culture'] });
  });

  it('drops a country-less Wikipedia hit that duplicates a known place', () => {
    const capital = matchCountriesAndCapitals('lisbon', WORLD);
    const vague = [
      placeHitToSummary({ title: 'Lisbon', description: 'A historic city', thumbnailUrl: null }, WORLD, 0)!,
    ];
    expect(rankResults(capital, vague).map((destination) => destination.countryCode)).toEqual(['PT']);
  });

  it('sorts by score, then name', () => {
    const results = rankResults([
      { destination: countryToSummary(countryByCode('JP')), score: 40 },
      { destination: countryToSummary(countryByCode('FR')), score: 80 },
      { destination: countryToSummary(countryByCode('ES')), score: 40 },
    ]);
    expect(results.map((destination) => destination.name)).toEqual(['France', 'Japan', 'Spain']);
  });
});
