import { Linking } from 'react-native';

import { type Logger } from '@/core/logging/Logger';

/**
 * Opens a URL outside the app (browser, maps, mail). Never rejects: a failure
 * (no app can handle the URL, a restricted profile, a blocked popup on web) is
 * logged and reported as `false`, so the caller can tell the user.
 */
export async function openExternalUrl(url: string, logger: Logger): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch (error) {
    logger.warn('Could not open external URL', { url, error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}
