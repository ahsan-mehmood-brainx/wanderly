import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Linking } from 'react-native';

import { routes } from '@/shared/navigation/routes';
import { httpFailure, stubDiscoverApis, summaryDto } from '@/testing/discoverFixtures';
import { apiSuccess, FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { renderWithProviders } from '@/testing/renderWithProviders';

import { summaryPath } from '../../data/WikipediaPlaceContentRepository';
import { placeDestinationId } from '../../domain/DestinationId';
import { DestinationScreen } from './DestinationScreen';

jest.mock('expo-router', () => {
  const actual = jest.requireActual('expo-router');
  return {
    ...actual,
    router: { push: jest.fn(), replace: jest.fn(), navigate: jest.fn() },
    // The screen sets its header title; there is no navigator in these tests.
    Stack: Object.assign(() => null, { Screen: () => null }),
  };
});

async function setup(id: string, configureApis?: (apis: ReturnType<typeof stubDiscoverApis>) => void) {
  const httpClientFactory = new FakeHttpClientFactory();
  const apis = stubDiscoverApis(httpClientFactory);
  configureApis?.(apis);
  const rendered = await renderWithProviders(<DestinationScreen destinationId={id} />, {
    dependencies: { httpClientFactory },
  });
  return { ...apis, ...rendered, user: userEvent.setup() };
}

describe('DestinationScreen', () => {
  beforeEach(() => jest.mocked(router.push).mockClear());

  it('shows a country: flag, facts, description and travel essentials', async () => {
    await setup('country-pt');

    expect(await screen.findByRole('header', { name: 'Portugal' })).toBeOnTheScreen();
    expect(screen.getByRole('image', { name: 'The flag of Portugal.' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Capital: Lisbon')).toBeOnTheScreen();
    expect(screen.getByLabelText('Region: Europe · Southern Europe')).toBeOnTheScreen();
    expect(screen.getByLabelText('Population: 10,639,726')).toBeOnTheScreen();
    expect(screen.getByLabelText('Area: 92,000 km²')).toBeOnTheScreen();
    expect(screen.getByLabelText('Languages: Portuguese')).toBeOnTheScreen();
    expect(screen.getByLabelText('Currencies: Euro (EUR, €)')).toBeOnTheScreen();
    expect(screen.getByText('Portugal is a lovely place.')).toBeOnTheScreen();
    expect(screen.getByText('Text from Wikipedia, available under CC BY-SA 4.0.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Calling code: +351')).toBeOnTheScreen();
    expect(screen.getByLabelText('Driving side: Right')).toBeOnTheScreen();
  });

  it('links to neighbouring countries', async () => {
    const { user } = await setup('country-pt');
    await user.press(await screen.findByRole('button', { name: 'Spain' }));
    expect(router.push).toHaveBeenCalledWith(routes.destination('country-es'));
  });

  it('records the destination as recently viewed', async () => {
    const { store } = await setup('country-pt');
    await screen.findByRole('header', { name: 'Portugal' });
    await waitFor(() =>
      expect(store.getState().discover.recentlyViewed.map((recent) => recent.id)).toEqual(['country-pt']),
    );
  });

  it('says so when Wikipedia has no description', async () => {
    await setup('country-pt', ({ wikipedia }) => {
      for (const title of ['Portugal', 'Portugal (country)']) {
        wikipedia.on('GET', summaryPath(title), httpFailure('notFound', 404));
      }
    });

    expect(await screen.findByText("There's no description for this destination yet.")).toBeOnTheScreen();
    expect(screen.getByLabelText('Capital: Lisbon')).toBeOnTheScreen();
  });

  it('still shows the country when the description fails to load, and retries it', async () => {
    const { wikipedia, user } = await setup('country-pt', ({ wikipedia }) =>
      wikipedia.on('GET', summaryPath('Portugal'), httpFailure('server', 503)),
    );
    expect(await screen.findByText("We couldn't load the description right now.")).toBeOnTheScreen();

    wikipedia.on('GET', summaryPath('Portugal'), apiSuccess(summaryDto('Portugal')));
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText(summaryDto('Portugal').extract as string)).toBeOnTheScreen();
    expect(screen.queryByText("We couldn't load the description right now.")).not.toBeOnTheScreen();
  });

  it('tells the user when the article link cannot be opened', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValueOnce(new Error('No browser'));
    const { user } = await setup('country-pt');

    await user.press(await screen.findByRole('link', { name: 'Read more on Wikipedia' }));

    expect(
      await screen.findByText("We couldn't open the article. Check that a browser is available and try again."),
    ).toBeOnTheScreen();
  });

  it('shows a place with its host country and that country’s essentials', async () => {
    const { user } = await setup('kyoto');

    expect(await screen.findByRole('header', { name: 'Kyoto' })).toBeOnTheScreen();
    expect(screen.getByText('Travel essentials for Japan')).toBeOnTheScreen();
    expect(screen.getByLabelText('Currencies: Japanese yen (JPY, ¥)')).toBeOnTheScreen();
    expect(screen.getByLabelText('Driving side: Left')).toBeOnTheScreen();
    expect(screen.getByText(/Country data services don't cover cities/)).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'View Japan' }));
    expect(router.push).toHaveBeenCalledWith(routes.destination('country-jp'));
  });

  it('shows a placeholder when a place has no image or description', async () => {
    const id = placeDestinationId('Nowhere Special', null);
    await setup(id, ({ wikipedia }) =>
      wikipedia.on('GET', summaryPath('Nowhere Special'), httpFailure('notFound', 404)),
    );

    expect(await screen.findByRole('header', { name: 'Nowhere Special' })).toBeOnTheScreen();
    expect(screen.getByTestId('destination-image-placeholder')).toBeOnTheScreen();
    expect(screen.getByText("We couldn't tell which country this place is in.")).toBeOnTheScreen();
  });

  it('shows an error with retry when the country cannot be loaded', async () => {
    await setup('country-pt', ({ restCountries }) =>
      restCountries.on('GET', '/codes.alpha_2/PT', httpFailure('rateLimited', 429)),
    );

    expect(
      await screen.findByText('Too many requests right now. Please wait a moment and try again.'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });

  it('offers no retry for a destination that does not exist', async () => {
    await setup('country-zz', ({ restCountries }) =>
      restCountries.on('GET', '/codes.alpha_2/ZZ', httpFailure('notFound', 404)),
    );

    expect(await screen.findByText("We couldn't find what you were looking for.")).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});
