import { screen, userEvent } from '@testing-library/react-native';

import { renderWithProviders } from '@/testing/renderWithProviders';

import { AppBottomSheet } from './AppBottomSheet';
import { AppText } from './AppText';

describe('AppBottomSheet', () => {
  it('renders nothing while hidden', async () => {
    await renderWithProviders(
      <AppBottomSheet visible={false} onClose={jest.fn()} title="Filters">
        <AppText>Sheet body</AppText>
      </AppBottomSheet>,
    );

    expect(screen.queryByText('Sheet body')).not.toBeOnTheScreen();
  });

  it('shows its title and content when visible', async () => {
    await renderWithProviders(
      <AppBottomSheet visible onClose={jest.fn()} title="Filters">
        <AppText>Sheet body</AppText>
      </AppBottomSheet>,
    );

    expect(await screen.findByRole('header', { name: 'Filters' })).toBeOnTheScreen();
    expect(screen.getByText('Sheet body')).toBeOnTheScreen();
  });

  it('closes when the backdrop is pressed', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    await renderWithProviders(
      <AppBottomSheet visible onClose={onClose}>
        <AppText>Sheet body</AppText>
      </AppBottomSheet>,
    );

    await user.press(await screen.findByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores the backdrop when not dismissible', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    await renderWithProviders(
      <AppBottomSheet visible dismissible={false} onClose={onClose}>
        <AppText>Sheet body</AppText>
      </AppBottomSheet>,
    );

    await user.press(await screen.findByRole('button', { name: 'Close' }));

    expect(onClose).not.toHaveBeenCalled();
  });
});
