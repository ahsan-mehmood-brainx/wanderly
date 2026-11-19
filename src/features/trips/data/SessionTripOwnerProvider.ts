import { type SessionManager } from '@/features/auth/domain/SessionManager';

import { type TripOwnerProvider } from '../domain/repositories';

/** Trips belong to the account of the live session. */
export class SessionTripOwnerProvider implements TripOwnerProvider {
  constructor(private readonly session: Pick<SessionManager, 'current'>) {}

  currentOwnerId(): string | null {
    const user = this.session.current?.user;
    return user ? String(user.id) : null;
  }
}
