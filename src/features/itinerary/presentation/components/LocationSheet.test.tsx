import { act, fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { type AppDependencies } from '@/core/di/AppDependencies';
import { renderWithProviders } from '@/testing/renderWithProviders';

import { LocationSheet } from './LocationSheet';

/** A place search that only settles when it is aborted. */
function hangingSearch() {
  const execute = jest.fn(
    ({ signal }: { signal: AbortSignal }) =>
      new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve({ ok: false, error: { kind: 'cancelled' } }));
      }),
  );
  return { execute } as unknown as AppDependencies['searchPlaces'];
}

function Host() {
  const [visible, setVisible] = useState(true);
  return (
    <>
      <Pressable testID="toggle-sheet" onPress={() => setVisible((value) => !value)} />
      <LocationSheet visible={visible} onSelect={jest.fn()} onClose={() => setVisible(false)} />
    </>
  );
}

describe('LocationSheet', () => {
  it('is ready to search again when reopened after closing mid-search', async () => {
    const searchPlaces = hangingSearch();
    await renderWithProviders(<Host />, { dependencies: { searchPlaces } });

    fireEvent.changeText(screen.getByLabelText('Search for a place'), 'Belém');
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Search' }));
    });
    expect(screen.getByLabelText('Searching')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();

    await act(async () => {
      fireEvent.press(screen.getByTestId('toggle-sheet'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('toggle-sheet'));
    });

    expect(screen.queryByLabelText('Searching')).toBeNull();
    expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled();
    expect(searchPlaces.execute).toHaveBeenCalledTimes(1);
  });

  it('asks for a longer query instead of searching with one character', async () => {
    const execute = jest.fn();
    const searchPlaces = { execute } as unknown as AppDependencies['searchPlaces'];
    await renderWithProviders(<Host />, { dependencies: { searchPlaces } });

    const input = screen.getByLabelText('Search for a place');
    fireEvent.changeText(input, ' B ');
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();

    await act(async () => {
      fireEvent(input, 'submitEditing');
    });
    expect(screen.getByText('Type at least 2 characters to search.')).toBeOnTheScreen();
    expect(execute).not.toHaveBeenCalled();

    fireEvent.changeText(input, 'Be');
    expect(screen.queryByText('Type at least 2 characters to search.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled();
  });
});
