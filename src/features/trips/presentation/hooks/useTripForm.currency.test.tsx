import { getLocales } from 'expo-localization';
import { Stack } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';

import NewTripRoute from '@/app/(app)/(tabs)/trips/new';
import TripsRoute from '@/app/(app)/(tabs)/trips/index';
import { AppProviders } from '@/bootstrap/AppProviders';
import { createI18n } from '@/core/i18n/createI18n';
import { DEFAULT_PREFERENCES, type CurrencyPreference } from '@/features/preferences/domain/Preferences';
import { createTestStore } from '@/testing/createTestStore';
import { FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { ManualClock } from '@/testing/ManualClock';
import { MockPreferencesRepository } from '@/testing/MockPreferencesRepository';
import { createTestDependencies } from '@/testing/testDependencies';
import { seededTripDatabase, TRIPS_NOW } from '@/testing/tripFixtures';

type DeviceLocales = ReturnType<typeof getLocales>;

const usDevice = getLocales();

async function openNewTrip(currency: CurrencyPreference) {
  const storage = await seededTripDatabase([]);
  const dependencies = createTestDependencies({
    database: storage.database,
    clock: new ManualClock(TRIPS_NOW),
    httpClientFactory: new FakeHttpClientFactory(),
    preferencesRepository: new MockPreferencesRepository({ ...DEFAULT_PREFERENCES, currency }),
  });
  const container = { dependencies, store: createTestStore(dependencies), i18n: createI18n('en') };

  await renderRouter(
    {
      _layout: () => (
        <AppProviders container={container}>
          <Stack screenOptions={{ headerShown: false }} />
        </AppProviders>
      ),
      'trips/index': TripsRoute,
      'trips/new': NewTripRoute,
    },
    { initialUrl: '/trips/new' },
  );
  return screen.findByTestId('trip-currency-field');
}

describe('New Trip default currency', () => {
  afterEach(() => {
    jest.mocked(getLocales).mockReturnValue(usDevice);
  });

  it('TC-06 preselects the currency chosen in Settings', async () => {
    const field = await openNewTrip('EUR');

    expect(field).toHaveTextContent(/EUR/);
    expect(field).not.toHaveTextContent(/USD/);
  });

  it('TC-06 preselects a chosen currency even when the device region has another one', async () => {
    jest.mocked(getLocales).mockReturnValue([{ ...usDevice[0], currencyCode: 'GBP' }] as DeviceLocales);

    const field = await openNewTrip('PKR');

    expect(field).toHaveTextContent(/PKR/);
  });

  it('TC-06 keeps the device region currency for "Device region"', async () => {
    jest.mocked(getLocales).mockReturnValue([{ ...usDevice[0], currencyCode: 'GBP' }] as DeviceLocales);

    expect(await openNewTrip('system')).toHaveTextContent(/GBP/);
  });

  it('TC-06 falls back to USD for "Device region" when the region currency is not offered', async () => {
    jest.mocked(getLocales).mockReturnValue([{ ...usDevice[0], currencyCode: 'XOF' }] as DeviceLocales);

    expect(await openNewTrip('system')).toHaveTextContent(/USD/);
  });
});
