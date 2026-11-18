import { screen, userEvent } from '@testing-library/react-native';

import { renderWithProviders } from '@/testing/renderWithProviders';

import { AppChip } from './AppChip';

describe('AppChip', () => {
  it('is a button that reports its selected state', async () => {
    const onPress = jest.fn();
    await renderWithProviders(<AppChip label="Beaches" icon="beach" selected onPress={onPress} />);

    const chip = await screen.findByRole('button', { name: 'Beaches' });
    expect(chip).toBeSelected();
    await userEvent.setup().press(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('uses an explicit accessibility label and ignores presses when disabled', async () => {
    const onPress = jest.fn();
    await renderWithProviders(
      <AppChip label="Asia" trailingIcon="close" accessibilityLabel="Remove filter: Asia" disabled onPress={onPress} />,
    );

    const chip = await screen.findByRole('button', { name: 'Remove filter: Asia' });
    await userEvent.setup().press(chip);
    expect(chip).toBeDisabled();
    expect(onPress).not.toHaveBeenCalled();
  });
});
