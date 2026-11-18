import { Linking } from 'react-native';

import { createTestLogger } from '@/testing/testDependencies';

import { openExternalUrl } from './openExternalUrl';

describe('openExternalUrl', () => {
  afterEach(() => jest.restoreAllMocks());

  it('opens the URL', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await expect(openExternalUrl('https://example.com', createTestLogger())).resolves.toBe(true);
    expect(open).toHaveBeenCalledWith('https://example.com');
  });

  it('logs and reports a failure instead of rejecting', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('No app can open it'));
    const logger = createTestLogger();
    await expect(openExternalUrl('https://example.com', logger)).resolves.toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      'Could not open external URL',
      expect.objectContaining({ url: 'https://example.com' }),
    );
  });
});
