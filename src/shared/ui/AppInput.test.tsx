import { screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';

import { renderWithProviders } from '@/testing/renderWithProviders';

import { AppInput, type AppInputProps } from './AppInput';

function ControlledInput(props: Omit<AppInputProps, 'value' | 'onChangeText'>) {
  const [value, setValue] = useState('');
  return <AppInput {...props} value={value} onChangeText={setValue} />;
}

describe('AppInput', () => {
  it('uses the label as the accessible name and the hint as its description', async () => {
    await renderWithProviders(<AppInput label="Destination" hint="City or country" />);

    const input = await screen.findByLabelText('Destination');
    expect(input.props.accessibilityHint).toBe('City or country');
    expect(screen.getByText('City or country')).toBeOnTheScreen();
  });

  it('shows the error instead of the hint', async () => {
    await renderWithProviders(<AppInput label="Email" hint="We never share it" error="Enter a valid email address." />);

    expect(await screen.findByText('Enter a valid email address.')).toBeOnTheScreen();
    expect(screen.queryByText('We never share it')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Email').props.accessibilityHint).toBe('Enter a valid email address.');
  });

  it('toggles password visibility', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<ControlledInput label="Password" secureTextEntry />);

    const input = await screen.findByLabelText('Password');
    expect(input.props.secureTextEntry).toBe(true);

    await user.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);

    await user.press(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
  });

  it('offers a clear button only while there is text', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<ControlledInput label="Search" clearable />);

    expect(screen.queryByRole('button', { name: 'Clear text' })).not.toBeOnTheScreen();
    await user.type(await screen.findByLabelText('Search'), 'Lisbon');

    await user.press(screen.getByRole('button', { name: 'Clear text' }));

    expect(screen.getByLabelText('Search').props.value).toBe('');
    expect(screen.queryByRole('button', { name: 'Clear text' })).not.toBeOnTheScreen();
  });

  it('is not editable when disabled', async () => {
    await renderWithProviders(<AppInput label="Name" disabled />);

    expect((await screen.findByLabelText('Name')).props.editable).toBe(false);
  });
});
