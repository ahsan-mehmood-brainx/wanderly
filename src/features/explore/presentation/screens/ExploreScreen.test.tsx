import { act, screen } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { renderWithProviders } from '@/testing/renderWithProviders';

import { ExploreScreen } from './ExploreScreen';

describe('ExploreScreen', () => {
  it('greets the user based on the local time', async () => {
    await renderWithProviders(<ExploreScreen now={() => new Date(2026, 10, 10, 9, 0)} />);

    expect(await screen.findByText('Good morning')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Where to next?' })).toBeOnTheScreen();
  });

  it('updates the greeting when the app returns to the foreground', async () => {
    const listeners: ((state: AppStateStatus) => void)[] = [];
    const addEventListener = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.push(listener);
      return { remove: jest.fn() };
    });
    let current = new Date(2026, 10, 10, 9, 0);
    const now = () => current;

    try {
      await renderWithProviders(<ExploreScreen now={now} />);
      expect(await screen.findByText('Good morning')).toBeOnTheScreen();

      current = new Date(2026, 10, 10, 19, 0);
      await act(async () => listeners.forEach((listener) => listener('active')));

      expect(screen.getByText('Good evening')).toBeOnTheScreen();
    } finally {
      addEventListener.mockRestore();
    }
  });
});
