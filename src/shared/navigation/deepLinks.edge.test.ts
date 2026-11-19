import { resolveDeepLink } from './deepLinks';
import { routes } from './routes';

describe('itinerary deep link edge cases', () => {
  it('does not treat the "day" screen word as an activity id when the date is missing', () => {
    expect(resolveDeepLink('/trips/t-42/itinerary/day')).toBeNull();
  });

  it('does not open an edit form for the "new" or "day" screen words', () => {
    expect(resolveDeepLink('/trips/t-42/itinerary/new/edit')).toBeNull();
    expect(resolveDeepLink('/trips/t-42/itinerary/day/edit')).toBeNull();
  });

  it('opens a day link with a trailing slash, an encoded date and a query string', () => {
    expect(resolveDeepLink('wanderly://trips/t-42/itinerary/day/2027-07-01/?from=share')).toEqual(
      routes.itineraryDay('t-42', '2027-07-01'),
    );
    expect(resolveDeepLink('/trips/t-42/itinerary/day/2027%2D07%2D01')).toEqual(
      routes.itineraryDay('t-42', '2027-07-01'),
    );
  });

  it('refuses links nested deeper than any itinerary screen', () => {
    expect(resolveDeepLink('/trips/t-42/itinerary/day/2027-07-01/extra')).toBeNull();
    expect(resolveDeepLink('/trips/t-42/itinerary/a1/edit/extra')).toBeNull();
  });
});
