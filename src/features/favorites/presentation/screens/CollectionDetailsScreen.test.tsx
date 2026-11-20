import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { customCollection, FAVORITES_NOW, seededFavoritesDatabase } from '@/testing/favoritesFixtures';
import { ManualClock } from '@/testing/ManualClock';
import { renderWithProviders } from '@/testing/renderWithProviders';

import { CollectionDetailsScreen } from './CollectionDetailsScreen';

// Navigation is held in place, so the test sees what the screen renders while it goes back.
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
}));

const food = customCollection({ id: 'food', name: 'Lisbon food' });

describe('CollectionDetailsScreen', () => {
  it('does not show "Collection not found" while it goes back after deleting its collection', async () => {
    const storage = await seededFavoritesDatabase({ collections: [food] });
    await renderWithProviders(<CollectionDetailsScreen collectionId="food" />, {
      dependencies: { database: storage.database, clock: new ManualClock(FAVORITES_NOW + 60_000) },
    });
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'Delete collection' }));
    await user.press(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('collection-not-found')).toBeNull();
  });
});
