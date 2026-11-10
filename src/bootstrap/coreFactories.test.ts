import { createAppConfig } from '@/core/config/appConfig';
import { type CoreDependencies } from '@/core/di/CoreDependencies';
import { createContainer } from '@/core/di/createContainer';

import { createCoreFactories } from './coreFactories';

jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  getNetworkStateAsync: jest.fn(() => new Promise(() => undefined)),
  NetworkStateType: {},
}));

const releaseLogger = () =>
  createContainer<CoreDependencies>(createCoreFactories({ config: createAppConfig(false), getLanguage: () => 'en' }))
    .logger;

describe('createCoreFactories logger (release build)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('still emits warnings and errors', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const logger = releaseLogger();

    logger.warn('font failed');
    logger.error('request failed', new Error('boom'));

    expect(warn).toHaveBeenCalledWith('[Wanderly] font failed');
    expect(error).toHaveBeenCalledWith('[Wanderly] request failed', expect.any(Error));
  });

  it('drops debug and info', () => {
    const debug = jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const logger = releaseLogger();

    logger.debug('noise');
    logger.info('noise');

    expect(debug).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });
});
