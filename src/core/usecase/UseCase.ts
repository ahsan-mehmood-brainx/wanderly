/**
 * A single application action (load preferences, search destinations, ...).
 *
 * Use cases hold business rules and orchestrate repositories. They depend only on
 * domain types and ports, never on React, Redux, storage or HTTP, so they are
 * tested with mock repositories and reused by any presentation layer.
 *
 * Consumers depend on this interface rather than the concrete class, so a test
 * can substitute `{ execute: jest.fn() }`.
 */
export interface UseCase<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}
