import { type AuthSession } from '@/features/auth/domain/AuthSession';
import { createTestDependencies } from '@/testing/testDependencies';

import { SessionTripOwnerProvider } from './SessionTripOwnerProvider';

const session: AuthSession = {
  user: { id: 42, username: 'ana', email: 'ana@example.com', firstName: 'Ana', lastName: 'Silva', imageUrl: null },
  tokens: { accessToken: 'a', refreshToken: 'r', accessTokenExpiresAt: 1, refreshTokenExpiresAt: null },
};

describe('SessionTripOwnerProvider', () => {
  it('follows the live session', async () => {
    const { sessionManager } = createTestDependencies();
    const owners = new SessionTripOwnerProvider(sessionManager);
    expect(owners.currentOwnerId()).toBeNull();

    sessionManager.adopt(session);
    expect(owners.currentOwnerId()).toBe('42');

    await sessionManager.end();
    expect(owners.currentOwnerId()).toBeNull();
  });
});
