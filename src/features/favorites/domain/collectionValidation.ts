import { type Collection, MAX_COLLECTION_NAME } from './Collection';

export type CollectionNameError = 'required' | 'tooLong' | 'duplicate';

export type CollectionNameValidation =
  { readonly ok: true; readonly name: string } | { readonly ok: false; readonly error: CollectionNameError };

const comparable = (name: string) => name.trim().toLocaleLowerCase();

/** Whether another of `existing`'s custom collections already has `name`, ignoring case. */
export function isCollectionNameTaken(
  name: string,
  existing: readonly Collection[],
  excludeId: string | null = null,
): boolean {
  const wanted = comparable(name);
  return existing.some(
    (collection) =>
      collection.kind === 'custom' &&
      collection.id !== excludeId &&
      collection.name !== null &&
      comparable(collection.name) === wanted,
  );
}

/**
 * Trims `input` and checks it is 1 to `MAX_COLLECTION_NAME` characters and not the
 * name of another of `existing`'s custom collections, ignoring case. `excludeId`
 * is the collection being renamed.
 */
export function validateCollectionName(
  input: string,
  existing: readonly Collection[],
  excludeId: string | null = null,
): CollectionNameValidation {
  const name = input.trim();
  if (name.length === 0) return { ok: false, error: 'required' };
  if (name.length > MAX_COLLECTION_NAME) return { ok: false, error: 'tooLong' };
  return isCollectionNameTaken(name, existing, excludeId) ? { ok: false, error: 'duplicate' } : { ok: true, name };
}
