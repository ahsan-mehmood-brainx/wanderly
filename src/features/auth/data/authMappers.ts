import { type AuthSession, type AuthTokens } from '../domain/AuthSession';
import { type AuthUser } from '../domain/AuthUser';
import { type LoginResponseDto, type TokenPairDto, type UserDto } from './dto/authDtos';
import { readJwtExpiry } from './jwt';

export const toAuthUser = (dto: UserDto): AuthUser => ({
  id: dto.id,
  username: dto.username,
  email: dto.email,
  firstName: dto.firstName,
  lastName: dto.lastName,
  imageUrl: dto.image || null,
});

/**
 * Expiry comes from the tokens' own `exp` claim. If a token can't be read, the
 * lifetime the app requested is assumed, measured from when the request was sent
 * (so the estimate errs on the early side).
 */
export function toAuthTokens(dto: TokenPairDto, requestedAt: number, requestedLifetimeMs: number): AuthTokens {
  return {
    accessToken: dto.accessToken,
    refreshToken: dto.refreshToken,
    accessTokenExpiresAt: readJwtExpiry(dto.accessToken) ?? requestedAt + requestedLifetimeMs,
    refreshTokenExpiresAt: readJwtExpiry(dto.refreshToken),
  };
}

export function toAuthSession(dto: LoginResponseDto, requestedAt: number, requestedLifetimeMs: number): AuthSession {
  return { user: toAuthUser(dto), tokens: toAuthTokens(dto, requestedAt, requestedLifetimeMs) };
}
