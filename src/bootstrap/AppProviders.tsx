import { type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider as ReduxProvider } from 'react-redux';

import { type AppContainer } from './createAppContainer';
import { PreferencesGate } from './PreferencesGate';

interface AppProvidersProps {
  readonly container: Pick<AppContainer, 'store' | 'i18n'>;
  readonly onReady?: () => void;
  readonly children: ReactNode;
}

export function AppProviders({ container, onReady, children }: AppProvidersProps) {
  return (
    <ReduxProvider store={container.store}>
      <I18nextProvider i18n={container.i18n}>
        <SafeAreaProvider>
          <PreferencesGate onReady={onReady}>{children}</PreferencesGate>
        </SafeAreaProvider>
      </I18nextProvider>
    </ReduxProvider>
  );
}
