import { router, Stack, useLocalSearchParams } from 'expo-router';
import { userEvent } from '@testing-library/react-native';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Pressable, Text } from 'react-native';

import AuthLayout from '@/app/(auth)/_layout';
import RegisterRoute from '@/app/(auth)/register';
import SignInRoute from '@/app/(auth)/sign-in';
import OnboardingRoute from '@/app/onboarding';
import SplashRoute from '@/app/splash';
import { type AppDependencies } from '@/core/di/AppDependencies';
import { createI18n } from '@/core/i18n/createI18n';
import { createAppStore } from '@/core/store/store';
import { SESSION_MARKER_KEY, SESSION_SECURE_KEY } from '@/features/auth/data/SecureSessionRepository';
import { signOut } from '@/features/auth/presentation/state/authSlice';
import { ONBOARDING_STORAGE_KEY } from '@/features/onboarding/data/StorageOnboardingRepository';
import { deepLinkInbox } from '@/shared/navigation/deepLinks';
import { routes } from '@/shared/navigation/routes';
import { httpError, stubDummyJson, testSession } from '@/testing/authFixtures';
import { FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { ManualClock } from '@/testing/ManualClock';
import { createTestDependencies } from '@/testing/testDependencies';

import { AppProviders } from './AppProviders';
import { RootNavigator } from './RootNavigator';

interface Scenario {
  /** Onboarding already done (the default) or a first run. */
  readonly onboarded?: boolean;
  /** A session saved by a previous run. */
  readonly storedSession?: ReturnType<typeof testSession>;
  readonly initialUrl?: string;
  /** Scripts the HTTP fake before the app starts (e.g. a refresh refused during launch). */
  readonly configureApi?: (api: ReturnType<typeof stubDummyJson>) => void;
}

/** Signed-in area stand-in: the drawer and native tabs need native views, the guards under test don't. */
function SignedInHome() {
  return <Text>Signed-in home</Text>;
}

function TripProbe() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <Text>{`Trip ${tripId}`}</Text>;
}

async function launch({ onboarded = true, storedSession, initialUrl = '/', configureApi }: Scenario = {}) {
  const keyValueStore = new InMemoryKeyValueStore(onboarded ? { [ONBOARDING_STORAGE_KEY]: 'true' } : {});
  const secureStore = new InMemoryKeyValueStore();
  if (storedSession) {
    secureStore.data.set(SESSION_SECURE_KEY, JSON.stringify(storedSession));
    keyValueStore.data.set(SESSION_MARKER_KEY, '1');
  }
  const httpClientFactory = new FakeHttpClientFactory();
  const api = stubDummyJson(httpClientFactory);
  configureApi?.(api);
  const clock = new ManualClock(1_000_000);
  const dependencies: AppDependencies = createTestDependencies({
    keyValueStore,
    secureStore,
    httpClientFactory,
    clock,
  });
  const store = createAppStore(dependencies);
  const container = { dependencies, store, i18n: createI18n('en') };

  function SignOutProbe() {
    return (
      <Pressable accessibilityRole="button" onPress={() => void store.dispatch(signOut())}>
        <Text>Probe sign out</Text>
      </Pressable>
    );
  }

  const rendered = await renderRouter(
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
      '(app)/index': () => (
        <>
          <SignedInHome />
          <SignOutProbe />
        </>
      ),
      '(app)/trips/[tripId]': TripProbe,
      '+not-found': () => <Text>Not found</Text>,
    },
    { initialUrl },
  );

  return { router: rendered, store, api, secureStore, keyValueStore, dependencies, clock };
}

async function signInWith(username: string, password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByTestId('sign-in-username'), username);
  await user.type(screen.getByTestId('sign-in-password'), password);
  await user.press(screen.getByRole('button', { name: 'Sign in' }));
}

// Full-app flows with typed input are slower than unit tests.
jest.setTimeout(20_000);

beforeEach(() => deepLinkInbox.clear());

describe('protected navigation', () => {
  it('shows the intro on first run, then sign-in once it is skipped', async () => {
    const { router, keyValueStore } = await launch({ onboarded: false });

    expect(await screen.findByText('Discover destinations')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Skip' }));

    expect(await screen.findByText('Welcome back')).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/sign-in');
    await waitFor(() => expect(keyValueStore.data.get(ONBOARDING_STORAGE_KEY)).toBe('true'));
  });

  it('walks the intro with Next and finishes with Get started', async () => {
    await launch({ onboarded: false });
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'Next' }));
    await user.press(screen.getByRole('button', { name: 'Next' }));
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Get started' }));

    expect(await screen.findByText('Welcome back')).toBeOnTheScreen();
  });

  it('redirects a signed-out user away from protected routes (missing token)', async () => {
    const { router } = await launch({ initialUrl: '/trips/42' });

    expect(await screen.findByText('Welcome back')).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/sign-in');
    expect(screen.queryByText('Trip 42')).not.toBeOnTheScreen();
  });

  it('keeps a signed-in user out of the auth screens', async () => {
    await launch({ storedSession: testSession() });
    expect(await screen.findByText('Signed-in home')).toBeOnTheScreen();

    await act(() => router.push(routes.signIn));

    expect(screen.getByText('Signed-in home')).toBeOnTheScreen();
    expect(screen.queryByText('Welcome back')).not.toBeOnTheScreen();
  });
});

describe('login', () => {
  it('signs in with valid credentials, stores the tokens securely, and opens the app', async () => {
    const { router, secureStore, keyValueStore } = await launch();

    await signInWith('emilys', 'emilyspass');

    expect(await screen.findByText('Signed-in home')).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/');
    expect(secureStore.data.get(SESSION_SECURE_KEY)).toContain('accessToken');
    // Nothing token-like ever lands in plain storage.
    expect([...keyValueStore.data.values()].join()).not.toMatch(/eyJ/);
  });

  it('explains invalid credentials and stays on sign-in', async () => {
    await launch();

    await signInWith('emilys', 'wrong');

    expect(await screen.findByRole('alert')).toHaveTextContent(/username and password don't match/);
    expect(screen.queryByText('Signed-in home')).not.toBeOnTheScreen();
  });

  it('validates empty fields without calling the server', async () => {
    const { api } = await launch();

    await userEvent.setup().press(await screen.findByRole('button', { name: 'Sign in' }));

    expect(screen.getByText('Enter your username.')).toBeOnTheScreen();
    expect(screen.getByText('Enter your password.')).toBeOnTheScreen();
    expect(api.publicApi.requests).toHaveLength(0);
  });

  it('reports network failures', async () => {
    const { api } = await launch();
    api.publicApi.on('POST', '/auth/login', httpError(0, 'network'));

    await signInWith('emilys', 'emilyspass');

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't reach the server/);
  });

  it('sends one request for a double-tapped sign-in', async () => {
    const { api } = await launch();
    const user = userEvent.setup();
    await user.type(await screen.findByTestId('sign-in-username'), 'emilys');
    await user.type(screen.getByTestId('sign-in-password'), 'emilyspass');

    const button = screen.getByRole('button', { name: 'Sign in' });
    await act(async () => {
      fireEvent.press(button);
      fireEvent.press(button);
    });

    expect(await screen.findByText('Signed-in home')).toBeOnTheScreen();
    expect(api.publicApi.requests.filter((request) => request.path === '/auth/login')).toHaveLength(1);
  });

  it('pauses sign-in after repeated failures', async () => {
    const { api } = await launch();
    const user = userEvent.setup();
    await user.type(await screen.findByTestId('sign-in-username'), 'emilys');
    await user.type(screen.getByTestId('sign-in-password'), 'wrong');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await user.press(screen.getByRole('button', { name: 'Sign in' }));
      await waitFor(() => expect(api.publicApi.requests).toHaveLength(attempt + 1));
    }

    expect(await screen.findByText('Too many failed attempts. Try again in 30 seconds.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(api.publicApi.requests).toHaveLength(5);
  }, 20_000);

  it('fills the demo account on request', async () => {
    await launch();

    await userEvent.setup().press(await screen.findByRole('button', { name: 'Use demo account' }));

    expect(screen.getByTestId('sign-in-username')).toHaveDisplayValue('emilys');
    expect(screen.getByTestId('sign-in-password')).toHaveDisplayValue('emilyspass');
  });
});

describe('demo registration', () => {
  it('explains the limitations, simulates sign-up, and returns to sign-in with the demo account', async () => {
    const { api } = await launch();
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'Create an account' }));
    expect(await screen.findByText('This is a demo sign-up')).toBeOnTheScreen();

    await user.type(screen.getByLabelText('First name'), 'Ada');
    await user.type(screen.getByLabelText('Last name'), 'Lovelace');
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Username'), 'ada_l');
    await user.type(screen.getByLabelText('Password'), 'analytical');
    await user.press(screen.getByRole('button', { name: 'Create demo account' }));

    expect(await screen.findByText('Demo account created')).toBeOnTheScreen();
    expect(api.publicApi.requests.at(-1)?.body).not.toHaveProperty('password');

    await user.press(screen.getByRole('button', { name: 'Sign in with demo account' }));
    await waitFor(() => expect(screen.getByTestId('sign-in-username')).toHaveDisplayValue('emilys'));
  });
});

describe('session restoration', () => {
  it('restores a stored session on restart, without the network', async () => {
    const { api } = await launch({ storedSession: testSession() });

    expect(await screen.findByText('Signed-in home')).toBeOnTheScreen();
    expect(api.publicApi.requests).toHaveLength(0);
  });

  it('renews an expired access token on restart', async () => {
    const { api, secureStore } = await launch({ storedSession: testSession({ accessTokenExpiresAt: 0 }) });

    expect(await screen.findByText('Signed-in home')).toBeOnTheScreen();
    expect(api.publicApi.requests[0]?.path).toBe('/auth/refresh');
    expect(secureStore.data.get(SESSION_SECURE_KEY)).toContain('refresh-2');
  });

  it('asks the user to sign in again when the stored session can no longer be renewed', async () => {
    const { secureStore } = await launch({
      storedSession: testSession({ accessTokenExpiresAt: 0 }),
      configureApi: ({ publicApi }) => publicApi.on('POST', '/auth/refresh', httpError(403, 'forbidden')),
    });

    expect(await screen.findByText('Your session expired. Please sign in again.')).toBeOnTheScreen();
    expect(secureStore.data.has(SESSION_SECURE_KEY)).toBe(false);
  });

  it('opens on sign-in after a restart in the middle of signing in (nothing was saved)', async () => {
    // A sign-in that never completed leaves no stored session behind.
    await launch();
    expect(await screen.findByText('Welcome back')).toBeOnTheScreen();
  });
});

describe('logout and expiry', () => {
  it('signs out, clears secure storage, and returns to sign-in', async () => {
    const { secureStore, router } = await launch({ storedSession: testSession() });
    await screen.findByText('Signed-in home');

    await userEvent.setup().press(screen.getByRole('button', { name: 'Probe sign out' }));

    expect(await screen.findByText("You've signed out.")).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/sign-in');
    expect(secureStore.data.has(SESSION_SECURE_KEY)).toBe(false);
  });

  it('returns to sign-in with an explanation when the session expires mid-use', async () => {
    const { dependencies, api } = await launch({ storedSession: testSession() });
    await screen.findByText('Signed-in home');
    api.publicApi.on('POST', '/auth/refresh', httpError(401, 'unauthorized'));

    dependencies.sessionManager.simulateExpiry('session');
    await act(async () => {
      await dependencies.sessionManager.getValidAccessToken();
    });

    expect(await screen.findByText('Your session expired. Please sign in again.')).toBeOnTheScreen();
  });
});

describe('deep links', () => {
  it('opens a protected link after sign-in when it arrived while signed out', async () => {
    deepLinkInbox.record('wanderly://trips/42');
    const { router } = await launch({ initialUrl: '/trips/42' });

    await signInWith('emilys', 'emilyspass');

    expect(await screen.findByText('Trip 42')).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/trips/42');
  });

  it('opens a link after the session is restored at launch', async () => {
    deepLinkInbox.record('wanderly://trips/7');
    await launch({ storedSession: testSession(), initialUrl: '/trips/7' });

    expect(await screen.findByText('Trip 7')).toBeOnTheScreen();
  });

  it('ignores a pending link that targets the auth screens', async () => {
    deepLinkInbox.record('wanderly://register');
    await launch({ storedSession: testSession() });

    expect(await screen.findByText('Signed-in home')).toBeOnTheScreen();
  });
});
