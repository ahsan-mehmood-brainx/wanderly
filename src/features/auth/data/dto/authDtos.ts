import { z } from 'zod';

/** DummyJSON user fields Wanderly reads. `/auth/me` returns many more; zod strips them. */
export const userDtoSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  image: z.string().nullish(),
});
export type UserDto = z.infer<typeof userDtoSchema>;

export const tokenPairDtoSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});
export type TokenPairDto = z.infer<typeof tokenPairDtoSchema>;

/** `POST /auth/login`: the user plus a token pair. */
export const loginResponseDtoSchema = userDtoSchema.extend(tokenPairDtoSchema.shape);
export type LoginResponseDto = z.infer<typeof loginResponseDtoSchema>;

/** `POST /users/add`: DummyJSON echoes the user with a fake id and stores nothing. */
export const addUserResponseDtoSchema = z.object({
  id: z.number(),
  firstName: z.string(),
  username: z.string(),
});
