import { screen, userEvent } from '@testing-library/react-native';

import { renderWithProviders } from '@/testing/renderWithProviders';

import { AppButton } from './AppButton';

describe('AppButton', () => {
  it('is an accessible button that responds to presses', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await renderWithProviders(<AppButton label="Plan a trip" leftIcon="flight" onPress={onPress} />);

    await user.press(await screen.findByRole('button', { name: 'Plan a trip' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores presses and reports disabled when disabled', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await renderWithProviders(<AppButton label="Save" disabled onPress={onPress} />);

    const button = await screen.findByRole('button', { name: 'Save' });
    await user.press(button);

    expect(button).toBeDisabled();
    expect(onPress).not.toHaveBeenCalled();
  });

  it('reports busy and blocks presses while loading', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await renderWithProviders(<AppButton label="Save" loading onPress={onPress} />);

    const button = await screen.findByRole('button', { name: 'Save' });
    await user.press(button);

    expect(button).toBeBusy();
    expect(onPress).not.toHaveBeenCalled();
  });
});
