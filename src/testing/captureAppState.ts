import { act } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * Captures `AppState` listeners so a test can bring the app back to the foreground.
 * The React Native preset's AppState is itself a mock; spying and `mockRestore()`
 * would wipe its implementation for later tests, so the function is swapped and
 * restored. Call `restore()` after each test.
 */
export function captureAppState() {
  const listeners: ((state: AppStateStatus) => void)[] = [];
  const original = AppState.addEventListener;
  AppState.addEventListener = ((_type: string, listener: (state: AppStateStatus) => void) => {
    listeners.push(listener);
    return {
      remove: () => {
        const index = listeners.indexOf(listener);
        if (index !== -1) listeners.splice(index, 1);
      },
    };
  }) as typeof AppState.addEventListener;
  return {
    foreground: () => act(() => listeners.forEach((listener) => listener('active'))),
    /** Delivers several state changes in order inside one `act()`, as a quick switch away and back would. */
    send: (...states: AppStateStatus[]) =>
      act(() => states.forEach((state) => [...listeners].forEach((listener) => listener(state)))),
    restore: () => {
      AppState.addEventListener = original;
    },
  };
}
