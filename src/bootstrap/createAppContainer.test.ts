import { type AppDependencies } from '@/core/di/AppDependencies';

import { getAppliedLanguage } from './appliedLanguage';
import { createAppContainer } from './createAppContainer';

describe('createAppContainer (composition root)', () => {
  it('wires every registered service without errors or cycles', () => {
    const { dependencies } = createAppContainer();

    for (const key of Object.keys(dependencies) as (keyof AppDependencies)[]) {
      expect(dependencies[key]).toBeDefined();
    }
  });

  it('builds HTTP clients from the factory', () => {
    const { dependencies } = createAppContainer();
    const client = dependencies.httpClientFactory.create({ name: 'smoke', baseUrl: 'https://example.com' });
    expect(typeof client.get).toBe('function');
  });

  it('records the device language it started in, for PreferencesGate', () => {
    const { i18n } = createAppContainer();
    expect(i18n.language).toBe('en');
    expect(getAppliedLanguage(i18n)).toBe('en');
  });

  it('wires feature use cases to the store', () => {
    const { store } = createAppContainer();
    expect(store.getState().preferences.status).toBe('idle');
  });
});
