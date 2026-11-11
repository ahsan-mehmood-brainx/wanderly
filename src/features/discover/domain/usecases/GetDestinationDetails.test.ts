import { AppError } from '@/core/errors/AppError';
import { FakeCountryRepository, FakePlaceContentRepository, placeSummary } from '@/testing/discoverFixtures';

import { type DestinationDetails } from '../Destination';
import { placeDestinationId } from '../DestinationId';
import { GetDestinationDetails } from './GetDestinationDetails';

function setup() {
  const countries = new FakeCountryRepository();
  const content = new FakePlaceContentRepository();
  const useCase = new GetDestinationDetails(countries, content);
  const details = async (id: string): Promise<DestinationDetails> => {
    const result = await useCase.execute({ id });
    if (!result.ok) throw result.error;
    return result.value;
  };
  return { countries, content, useCase, details };
}

describe('GetDestinationDetails', () => {
  describe('countries', () => {
    it('combines REST Countries facts, the Wikipedia description and neighbours', async () => {
      const { details } = setup();

      const result = await details('country-pt');

      expect(result).toMatchObject({
        kind: 'country',
        id: 'country-pt',
        country: { name: 'Portugal', capitals: ['Lisbon'], population: 10_639_726 },
        description: { status: 'available', summary: { title: 'Portugal' } },
        neighbours: [{ id: 'country-es', name: 'Spain' }],
        essentials: { callingCodes: ['351'], drivingSide: 'right' },
      });
    });

    it("uses the country's own Wikipedia article first (Georgia is a disambiguation page)", async () => {
      const { details, content } = setup();
      content.summaries.set('Georgia', null);

      const result = await details('country-ge');

      expect(content.getSummary).toHaveBeenNthCalledWith(1, 'Georgia (country)', undefined);
      expect(result.description).toMatchObject({ status: 'available', summary: { title: 'Georgia (country)' } });
    });

    it('falls back through other titles, then reports a missing description', async () => {
      const { details, content, countries } = setup();
      countries.countries = countries.countries.map((country) =>
        country.code === 'JP' ? { ...country, wikipediaTitle: null } : country,
      );
      content.summaries.set('Japan', null);
      content.summaries.set('Japan (country)', null);

      const result = await details('country-jp');

      expect(content.getSummary.mock.calls.map(([title]) => title)).toEqual(['Japan', 'Japan (country)']);
      expect(result.description).toEqual({ status: 'missing' });
    });

    it('still shows the country when Wikipedia fails', async () => {
      const { details, content } = setup();
      content.summaryErrors.set('Portugal', new AppError('timeout', 'slow'));

      const result = await details('country-pt');

      expect(result.description).toEqual({ status: 'failed', errorKind: 'timeout' });
      expect(result.kind === 'country' && result.country.name).toBe('Portugal');
    });

    it('omits neighbours when the catalogue is unavailable', async () => {
      const { details, countries } = setup();
      countries.getAll.mockResolvedValueOnce({ ok: false, error: new AppError('rateLimited', '429') });
      const result = await details('country-pt');
      expect(result.kind === 'country' && result.neighbours).toEqual([]);
    });

    it('fails when the country itself cannot be loaded', async () => {
      const { useCase, countries } = setup();
      countries.byCodeError = new AppError('rateLimited', '429');
      const result = await useCase.execute({ id: 'country-pt' });
      expect(!result.ok && result.error.kind).toBe('rateLimited');
    });

    it('reports an unknown country as not found', async () => {
      const { useCase } = setup();
      const result = await useCase.execute({ id: 'country-zz' });
      expect(!result.ok && result.error.kind).toBe('notFound');
    });
  });

  describe('curated destinations', () => {
    it('uses the curated name, categories and host country', async () => {
      const { details } = setup();

      const result = await details('kyoto');

      expect(result).toMatchObject({
        kind: 'city',
        id: 'kyoto',
        name: 'Kyoto',
        categories: ['city', 'culture'],
        country: { code: 'JP' },
        essentials: { drivingSide: 'left' },
        description: { status: 'available' },
      });
    });

    it('reports an unknown slug as not found, without any request', async () => {
      const { useCase, countries, content } = setup();
      const result = await useCase.execute({ id: 'atlantis' });
      expect(!result.ok && result.error.kind).toBe('notFound');
      expect(countries.getByCode).not.toHaveBeenCalled();
      expect(content.getSummary).not.toHaveBeenCalled();
    });
  });

  describe('other places', () => {
    it('qualifies an ambiguous title with its country ("Kingston" → "Kingston, Jamaica")', async () => {
      const { details, content } = setup();
      content.summaries.set('Kingston', null);

      const result = await details(placeDestinationId('Kingston', 'JM'));

      expect(content.getSummary.mock.calls.map(([title]) => title)).toEqual(['Kingston', 'Kingston, Jamaica']);
      expect(result).toMatchObject({
        name: 'Kingston, Jamaica',
        country: { code: 'JM' },
        description: { status: 'available' },
      });
    });

    it('infers the country from the description when the id has none', async () => {
      const { details, content } = setup();
      content.summaries.set('Nara', placeSummary('Nara', { description: 'City in the Kansai region of Japan' }));

      const result = await details(placeDestinationId('Nara', null));

      expect(result).toMatchObject({ kind: 'city', country: { code: 'JP' }, categories: ['city'] });
    });

    it('shows what it can when neither country nor description is known', async () => {
      const { details, content } = setup();
      content.summaries.set('Nowhere Special', null);

      const result = await details(placeDestinationId('Nowhere Special', null));

      expect(result).toEqual({
        kind: 'place',
        id: placeDestinationId('Nowhere Special', null),
        name: 'Nowhere Special',
        description: { status: 'missing' },
        categories: [],
        country: null,
        essentials: null,
      });
    });

    it('treats a missing host country as unknown rather than failing', async () => {
      const { details, countries } = setup();
      countries.byCodeError = new AppError('server', '500');
      const result = await details(placeDestinationId('Lisbon', 'PT'));
      expect(result).toMatchObject({ country: null, description: { status: 'available' } });
    });

    it('propagates cancellation so nothing half-loaded is cached', async () => {
      const { useCase, content } = setup();
      content.summaryErrors.set('Lisbon', new AppError('cancelled', 'left the screen'));
      const result = await useCase.execute({ id: placeDestinationId('Lisbon', 'PT') });
      expect(!result.ok && result.error.kind).toBe('cancelled');
    });
  });

  it('rejects malformed ids', async () => {
    const { useCase } = setup();
    const result = await useCase.execute({ id: 'place-!!' });
    expect(!result.ok && result.error.kind).toBe('notFound');
  });
});
