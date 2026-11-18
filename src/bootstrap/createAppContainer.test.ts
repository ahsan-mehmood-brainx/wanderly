import { type AppDependencies } from '@/core/di/AppDependencies';

import { createAppContainer } from './createAppContainer';

jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  getNetworkStateAsync: jest.fn(() => new Promise(() => undefined)),
  NetworkStateType: {},
}));

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

  it('wires feature use cases to the store', () => {
    const { store } = createAppContainer();
    expect(store.getState().preferences.status).toBe('idle');
  });
});
