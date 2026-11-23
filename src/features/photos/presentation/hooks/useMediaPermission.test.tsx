import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Linking, Pressable, Text, View } from 'react-native';

import { captureAppState } from '@/testing/captureAppState';
import { FakeMediaPermissionService } from '@/testing/photoFixtures';
import { renderWithProviders } from '@/testing/renderWithProviders';

import { type MediaKind, type MediaPermission } from '../../domain/repositories';
import { useMediaPermission } from './useMediaPermission';

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function Harness({ kind }: { readonly kind: MediaKind }) {
  const { permission, allowed, requesting, request, openSettings } = useMediaPermission(kind);
  return (
    <View>
      <Text testID="permission">{permission ?? 'reading'}</Text>
      <Text testID="allowed">{String(allowed)}</Text>
      <Text testID="requesting">{String(requesting)}</Text>
      <Pressable accessibilityRole="button" onPress={request}>
        <Text>Request</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={openSettings}>
        <Text>Settings</Text>
      </Pressable>
    </View>
  );
}

async function setup(kind: MediaKind, configure?: (service: FakeMediaPermissionService) => void) {
  const service = new FakeMediaPermissionService();
  configure?.(service);
  const rendered = await renderWithProviders(<Harness kind={kind} />, {
    dependencies: { mediaPermissionService: service },
  });
  return { ...rendered, service, user: userEvent.setup() };
}

const shown = (testID: string) => screen.getByTestId(testID).props.children as string;

describe('useMediaPermission', () => {
  let appState: ReturnType<typeof captureAppState>;

  beforeEach(() => {
    appState = captureAppState();
  });

  afterEach(() => {
    appState.restore();
    jest.restoreAllMocks();
  });

  it('reads the permission of the kind asked for without prompting', async () => {
    const { service } = await setup('camera', (s) => (s.permissions = { camera: 'blocked', library: 'granted' }));

    await waitFor(() => expect(shown('permission')).toBe('blocked'));
    expect(shown('allowed')).toBe('false');
    expect(service.getPermission).toHaveBeenCalledWith('camera');
    expect(service.requestPermission).not.toHaveBeenCalled();
  });

  it.each<[MediaPermission, string]>([
    ['granted', 'true'],
    ['limited', 'true'],
    ['undetermined', 'false'],
    ['denied', 'false'],
    ['blocked', 'false'],
  ])('treats %s library access as allowed: %s', async (permission, allowed) => {
    await setup('library', (s) => (s.permissions.library = permission));
    await waitFor(() => expect(shown('permission')).toBe(permission));
    expect(shown('allowed')).toBe(allowed);
  });

  it('asks the system once when Allow is tapped twice while the prompt is open', async () => {
    const answer = deferred<MediaPermission>();
    const { service, user } = await setup('camera', (s) =>
      s.requestPermission.mockImplementationOnce(() => answer.promise),
    );
    await waitFor(() => expect(shown('permission')).toBe('undetermined'));

    await user.press(screen.getByRole('button', { name: 'Request' }));
    expect(shown('requesting')).toBe('true');
    await user.press(screen.getByRole('button', { name: 'Request' }));
    await act(async () => answer.resolve('granted'));

    expect(service.requestPermission).toHaveBeenCalledTimes(1);
    expect(service.requestPermission).toHaveBeenCalledWith('camera');
    expect(shown('permission')).toBe('granted');
    expect(shown('allowed')).toBe('true');
    expect(shown('requesting')).toBe('false');
  });

  it('can ask again after the traveller declines while the system still allows asking', async () => {
    const { service, user } = await setup('library', (s) => (s.answerPromptWith.library = 'denied'));
    await waitFor(() => expect(shown('permission')).toBe('undetermined'));

    await user.press(screen.getByRole('button', { name: 'Request' }));
    await waitFor(() => expect(shown('permission')).toBe('denied'));

    service.answerPromptWith.library = 'granted';
    await user.press(screen.getByRole('button', { name: 'Request' }));

    await waitFor(() => expect(shown('permission')).toBe('granted'));
    expect(service.requestPermission).toHaveBeenCalledTimes(2);
  });

  it('reads the permission again when the app returns from system settings', async () => {
    const { service } = await setup('camera', (s) => (s.permissions.camera = 'blocked'));
    await waitFor(() => expect(shown('permission')).toBe('blocked'));

    service.permissions.camera = 'granted';
    await appState.foreground();

    await waitFor(() => expect(shown('permission')).toBe('granted'));
  });

  it('does not read the permission again when the app only goes to the background', async () => {
    const { service } = await setup('camera');
    await waitFor(() => expect(shown('permission')).toBe('undetermined'));
    const reads = service.getPermission.mock.calls.length;

    await appState.send('inactive', 'background');

    expect(service.getPermission).toHaveBeenCalledTimes(reads);
  });

  it('an older read that finishes after the prompt answer does not overwrite it', async () => {
    const { service, user } = await setup('camera');
    await waitFor(() => expect(shown('permission')).toBe('undetermined'));

    const slowRead = deferred<MediaPermission>();
    service.getPermission.mockImplementationOnce(() => slowRead.promise);
    await appState.foreground();
    await user.press(screen.getByRole('button', { name: 'Request' }));
    await waitFor(() => expect(shown('permission')).toBe('granted'));

    await act(async () => slowRead.resolve('undetermined'));

    expect(shown('permission')).toBe('granted');
  });

  it('opens the system settings, and only logs when they cannot be opened', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockRejectedValueOnce(new Error('no settings app'));
    const { dependencies, user } = await setup('camera', (s) => (s.permissions.camera = 'blocked'));

    await user.press(screen.getByRole('button', { name: 'Settings' }));

    expect(openSettings).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(dependencies.logger.warn).toHaveBeenCalled());
  });

  it('ignores a read that finishes after unmounting', async () => {
    const service = new FakeMediaPermissionService();
    const slowRead = deferred<MediaPermission>();
    service.getPermission.mockImplementationOnce(() => slowRead.promise);
    const errors = jest.spyOn(console, 'error');
    await renderWithProviders(<Harness kind="camera" />, { dependencies: { mediaPermissionService: service } });

    screen.unmount();
    await act(async () => slowRead.resolve('granted'));

    expect(errors).not.toHaveBeenCalled();
    expect(service.getPermission).toHaveBeenCalledTimes(1);
  });
});
