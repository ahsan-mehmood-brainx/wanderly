import { act } from '@testing-library/react-native';

import { deepLinkInbox } from '@/shared/navigation/deepLinks';
import { FakeNotificationResponses } from '@/testing/notificationFixtures';
import { renderWithProviders } from '@/testing/renderWithProviders';
import { OTHER_TRIP_OWNER, TRIP_OWNER } from '@/testing/tripFixtures';

import { useNotificationResponses } from './useNotificationResponses';

function BeforeSignIn() {
  useNotificationResponses(false);
  return null;
}

const tap = (url: unknown, ownerId: unknown = TRIP_OWNER, kind: unknown = 'tripStart') => ({
  url,
  ownerId,
  kind,
  fingerprint: 'f',
});

async function launchSignedOut() {
  const responses = new FakeNotificationResponses();
  await renderWithProviders(<BeforeSignIn />, { dependencies: { notificationResponses: responses } });
  return responses;
}

beforeEach(() => deepLinkInbox.clear());

describe('useNotificationResponses before sign-in', () => {
  it.each<[string, unknown]>([
    ['malformed data', { url: 42 }],
    ['no data', null],
    ['an unknown kind', tap('wanderly://trips/trip-1', TRIP_OWNER, 'marketing')],
    ['a sign-in link', tap('wanderly://sign-in')],
    ['a web link to a page outside the allow-list', tap('https://evil.example.com/steal')],
  ])('AC7 keeps nothing to open after sign-in for a tap with %s', async (_name, data) => {
    const responses = await launchSignedOut();

    await act(() => responses.tap(data));

    expect(deepLinkInbox.take()).toBeNull();
  });

  it('AC7 keeps the most recent of several taps for after sign-in', async () => {
    const responses = await launchSignedOut();

    await act(() => responses.tap(tap('wanderly://trips/trip-1')));
    await act(() => responses.tap(tap('wanderly://budget/trip-2', TRIP_OWNER, 'budget')));

    expect(deepLinkInbox.take()).toBe('wanderly://budget/trip-2');
  });

  it('AC7 keeps a tap whose owner cannot be checked yet; the account that signs in only sees its own data', async () => {
    const responses = await launchSignedOut();

    await act(() => responses.tap(tap('wanderly://trips/trip-1', OTHER_TRIP_OWNER)));

    expect(deepLinkInbox.take()).toBe('wanderly://trips/trip-1');
  });
});
