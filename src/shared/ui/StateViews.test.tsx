import { screen, userEvent } from '@testing-library/react-native';

import { MockPreferencesRepository } from '@/testing/MockPreferencesRepository';
import { renderWithProviders } from '@/testing/renderWithProviders';

import { AppAvatar } from './AppAvatar';
import { AppEmptyView } from './AppEmptyView';
import { AppErrorView } from './AppErrorView';
import { AppLoader } from './AppLoader';

describe('AppErrorView', () => {
  it('falls back to generic, translated copy and offers a retry', async () => {
    const user = userEvent.setup();
    const onRetry = jest.fn();
    await renderWithProviders(<AppErrorView onRetry={onRetry} />);

    expect(await screen.findByRole('header', { name: 'Something went wrong' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('has no retry button without a handler', async () => {
    await renderWithProviders(<AppErrorView title="You're offline" icon="offline" />);

    expect(await screen.findByRole('header', { name: "You're offline" })).toBeOnTheScreen();
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it('explains an error kind with translated copy', async () => {
    await renderWithProviders(<AppErrorView errorKind="offline" />);

    expect(await screen.findByRole('header', { name: "You're offline" })).toBeOnTheScreen();
    expect(screen.getByText('Connect to the internet and try again.')).toBeOnTheScreen();
  });

  it('uses the kind-specific message under the generic title for other errors', async () => {
    await renderWithProviders(<AppErrorView errorKind="server" />, {
      dependencies: { preferencesRepository: new MockPreferencesRepository({ theme: 'system', language: 'es' }) },
    });

    expect(await screen.findByRole('header', { name: 'Algo salió mal' })).toBeOnTheScreen();
    expect(screen.getByText('El servicio tiene problemas en este momento. Inténtalo más tarde.')).toBeOnTheScreen();
  });
});

describe('AppEmptyView', () => {
  it('shows the call to action only when both label and handler are given', async () => {
    const user = userEvent.setup();
    const onAction = jest.fn();
    await renderWithProviders(<AppEmptyView title="No trips yet" actionLabel="Plan a trip" onAction={onAction} />);

    await user.press(await screen.findByRole('button', { name: 'Plan a trip' }));

    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe('AppLoader', () => {
  it('announces a busy progress indicator with a default label', async () => {
    await renderWithProviders(<AppLoader />);

    expect(await screen.findByRole('progressbar', { name: 'Loading' })).toBeBusy();
  });
});

describe('AppAvatar', () => {
  it('shows initials when there is no photo', async () => {
    await renderWithProviders(<AppAvatar name="Ibn Battuta" />);

    expect(await screen.findByRole('image', { name: 'Ibn Battuta' })).toBeOnTheScreen();
    expect(screen.getByText('IB')).toBeOnTheScreen();
  });
});
