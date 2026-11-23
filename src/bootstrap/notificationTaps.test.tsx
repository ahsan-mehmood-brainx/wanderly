import { Stack, useLocalSearchParams } from 'expo-router';
import { userEvent } from '@testing-library/react-native';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import AuthLayout from '@/app/(auth)/_layout';
import RegisterRoute from '@/app/(auth)/register';
import SignInRoute from '@/app/(auth)/sign-in';
import OnboardingRoute from '@/app/onboarding';
import SplashRoute from '@/app/splash';
import { createI18n } from '@/core/i18n/createI18n';
import { createAppStore } from '@/core/store/store';
import { SESSION_MARKER_KEY, SESSION_SECURE_KEY } from '@/features/auth/data/SecureSessionRepository';
import { ONBOARDING_STORAGE_KEY } from '@/features/onboarding/data/StorageOnboardingRepository';
import { deepLinkInbox } from '@/shared/navigation/deepLinks';
import { stubDummyJson, testSession } from '@/testing/authFixtures';
import { FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { ManualClock } from '@/testing/ManualClock';
import { FakeNotificationResponses } from '@/testing/notificationFixtures';
import { createTestDependencies } from '@/testing/testDependencies';
import { OTHER_TRIP_OWNER, TRIP_OWNER } from '@/testing/tripFixtures';

import { AppProviders } from './AppProviders';
import { RootNavigator } from './RootNavigator';

function SignedInHome() {
  return <Text>Signed-in home</Text>;
}

function TripProbe() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <Text>{`Trip ${tripId}`}</Text>;
}

function ActivityProbe() {
  const { tripId, itemId } = useLocalSearchParams<{ tripId: string; itemId: string }>();
  return <Text>{`Activity ${itemId} of ${tripId}`}</Text>;
}

function BudgetProbe() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <Text>{`Budget of ${tripId}`}</Text>;
}

const tap = (url: string, ownerId: string = TRIP_OWNER, kind = 'tripStart') => ({
  url,
  ownerId,
  kind,
  fingerprint: 'f',
});

async function launch({
  signedIn,
  responses = new FakeNotificationResponses(),
}: {
  readonly signedIn: boolean;
  readonly responses?: FakeNotificationResponses;
}) {
  const keyValueStore = new InMemoryKeyValueStore({ [ONBOARDING_STORAGE_KEY]: 'true' });
  const secureStore = new InMemoryKeyValueStore();
  if (signedIn) {
    secureStore.data.set(SESSION_SECURE_KEY, JSON.stringify(testSession()));
    keyValueStore.data.set(SESSION_MARKER_KEY, '1');
  }
  const httpClientFactory = new FakeHttpClientFactory();
  stubDummyJson(httpClientFactory);
  const dependencies = createTestDependencies({
    keyValueStore,
    secureStore,
    httpClientFactory,
    clock: new ManualClock(1_000_000),
    notificationResponses: responses,
  });
  const store = createAppStore(dependencies);
  const container = { dependencies, store, i18n: createI18n('en') };

  const router = await renderRouter(
    {
      _layout: () => (
        <AppProviders container={container}>
          <RootNavigator />
        </AppProviders>
      ),
      splash: SplashRoute,
      onboarding: OnboardingRoute,
      '(auth)/_layout': AuthLayout,
      '(auth)/sign-in': SignInRoute,
      '(auth)/register': RegisterRoute,
      '(app)/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
      '(app)/index': SignedInHome,
      '(app)/trips/[tripId]': TripProbe,
      '(app)/trips/[tripId]/itinerary/[itemId]': ActivityProbe,
      '(app)/budget/[tripId]': BudgetProbe,
      '+not-found': () => <Text>Not found</Text>,
    },
    { initialUrl: '/' },
  );
  return { router, responses };
}

async function signIn() {
  const user = userEvent.setup();
  await user.type(await screen.findByTestId('sign-in-username'), 'emilys');
  await user.type(screen.getByTestId('sign-in-password'), 'emilyspass');
  await user.press(screen.getByRole('button', { name: 'Sign in' }));
}

jest.setTimeout(20_000);

beforeEach(() => deepLinkInbox.clear());

describe('notification taps', () => {
  it('AC7 a tap on a trip reminder while signed in opens the trip', async () => {
    const { responses, router } = await launch({ signedIn: true });
    await screen.findByText('Signed-in home');

    await act(() => responses.tap(tap('wanderly://trips/trip-1')));

    expect(await screen.findByText('Trip trip-1')).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/trips/trip-1');
  });

  it('AC7 a tap on an activity reminder opens the activity', async () => {
    const { responses } = await launch({ signedIn: true });
    await screen.findByText('Signed-in home');

    await act(() => responses.tap(tap('wanderly://trips/trip-1/itinerary/act-1', TRIP_OWNER, 'activity')));

    expect(await screen.findByText('Activity act-1 of trip-1')).toBeOnTheScreen();
  });

  it("AC7 a tap on a budget alert opens the trip's budget", async () => {
    const { responses } = await launch({ signedIn: true });
    await screen.findByText('Signed-in home');

    await act(() => responses.tap(tap('wanderly://budget/trip-1', TRIP_OWNER, 'budget')));

    expect(await screen.findByText('Budget of trip-1')).toBeOnTheScreen();
  });

  it("AC7 ignores a tap on another account's notification", async () => {
    const { responses, router } = await launch({ signedIn: true });
    await screen.findByText('Signed-in home');

    await act(() => responses.tap(tap('wanderly://trips/trip-1', OTHER_TRIP_OWNER)));
    await act(() => responses.tap({ url: 42 }));
    await act(() => responses.tap(tap('wanderly://register')));

    expect(screen.getByText('Signed-in home')).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/');

    await act(() => responses.tap(tap('wanderly://trips/trip-2')));
    expect(await screen.findByText('Trip trip-2')).toBeOnTheScreen();
  });

  it('AC7 a tap while signed out opens the trip after sign-in', async () => {
    const { responses } = await launch({ signedIn: false });
    await screen.findByText('Welcome back');

    await act(() => responses.tap(tap('wanderly://trips/trip-9')));
    expect(screen.queryByText('Trip trip-9')).not.toBeOnTheScreen();
    await signIn();

    expect(await screen.findByText('Trip trip-9')).toBeOnTheScreen();
  });

  it('AC7 a tap that launched the app opens the trip once the session is restored', async () => {
    const responses = new FakeNotificationResponses().launchedWith(tap('wanderly://trips/trip-7'));

    await launch({ signedIn: true, responses });

    expect(await screen.findByText('Trip trip-7')).toBeOnTheScreen();
  });

  it('stops listening for taps when the app unmounts', async () => {
    const { responses } = await launch({ signedIn: true });
    await screen.findByText('Signed-in home');
    expect(responses.listenerCount).toBe(1);

    screen.unmount();

    expect(responses.listenerCount).toBe(0);
  });
});
