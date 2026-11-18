import { type Logger } from '@/core/logging/Logger';
import { type UseCase } from '@/core/usecase/UseCase';
import { TIMED_OUT, withTimeout } from '@/core/utils/async';

import { DEFAULT_PREFERENCES, type Preferences } from '../Preferences';
import { type PreferencesRepository } from '../PreferencesRepository';

/** Launch is gated on loading preferences, so a hung storage read must not hold the splash screen forever. */
export const PREFERENCES_LOAD_TIMEOUT_MS = 3000;

/**
 * Loads the user's preferences for app start-up. Never fails: unreadable,
 * throwing or hung storage all resolve to defaults (and are logged), because
 * the app must always be able to launch.
 */
export class LoadPreferences implements UseCase<void, Preferences> {
  constructor(
    private readonly repository: PreferencesRepository,
    private readonly logger: Logger,
    private readonly timeoutMs: number = PREFERENCES_LOAD_TIMEOUT_MS,
  ) {}

  async execute(): Promise<Preferences> {
    try {
      const result = await withTimeout(this.repository.load(), this.timeoutMs);
      if (result === TIMED_OUT) {
        this.logger.warn('Loading preferences timed out; using defaults', { timeoutMs: this.timeoutMs });
      } else if (result.ok) {
        return result.value;
      } else {
        this.logger.error('Could not load preferences', result.error);
      }
    } catch (error) {
      // Repositories should return err(...); a throwing one is a contract violation worth surfacing.
      this.logger.error('Preferences repository threw while loading', error);
    }
    return DEFAULT_PREFERENCES;
  }
}
