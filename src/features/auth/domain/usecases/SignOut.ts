import { type Logger } from '@/core/logging/Logger';
import { type UseCase } from '@/core/usecase/UseCase';

import { type SessionManager } from '../SessionManager';

/**
 * Signs out locally (DummyJSON has no server-side logout). Never fails: the user
 * is always signed out of this run of the app. If secure storage can't be cleared
 * even after a retry, that is logged as an error because the session would come back on relaunch.
 */
export class SignOut implements UseCase<void, void> {
  constructor(
    private readonly sessionManager: Pick<SessionManager, 'end'>,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<void> {
    try {
      const cleared = await this.sessionManager.end();
      if (!cleared.ok) this.logger.error('Could not remove the session from secure storage', cleared.error);
    } catch (error) {
      this.logger.error('Session store threw while signing out', error);
    }
  }
}
