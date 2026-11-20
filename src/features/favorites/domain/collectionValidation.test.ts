import { customCollection, FAVORITES_NOW } from '@/testing/favoritesFixtures';

import { type Collection, DEFAULT_COLLECTIONS, isDefaultCollectionId, MAX_COLLECTION_NAME } from './Collection';
import { validateCollectionName } from './collectionValidation';

const defaults: Collection[] = DEFAULT_COLLECTIONS.map(({ id, key }) => ({
  id,
  kind: 'default',
  defaultKey: key,
  name: null,
  createdAt: FAVORITES_NOW,
  updatedAt: FAVORITES_NOW,
}));
const lisbonFood = customCollection({ id: 'food', name: 'Lisbon Food' });
const museums = customCollection({ id: 'museums', name: 'Museums' });
const existing = [...defaults, lisbonFood, museums];

describe('validateCollectionName', () => {
  it('AC4 accepts a name and trims it', () => {
    expect(validateCollectionName('  Weekend in Porto ', existing)).toEqual({ ok: true, name: 'Weekend in Porto' });
  });

  it.each([
    ['empty', ''],
    ['only spaces', '    '],
  ])('AC4 requires a name (%s)', (_label, input) => {
    expect(validateCollectionName(input, existing)).toEqual({ ok: false, error: 'required' });
  });

  it('AC4 accepts exactly 40 characters after trimming and refuses 41', () => {
    const forty = 'a'.repeat(MAX_COLLECTION_NAME);
    expect(MAX_COLLECTION_NAME).toBe(40);
    expect(validateCollectionName(`  ${forty} `, existing)).toEqual({ ok: true, name: forty });
    expect(validateCollectionName(`${forty}b`, existing)).toEqual({ ok: false, error: 'tooLong' });
  });

  it("AC4 refuses another custom collection's name, ignoring case and spaces around it", () => {
    expect(validateCollectionName(' lisbon FOOD ', existing)).toEqual({ ok: false, error: 'duplicate' });
  });

  it('AC4 only compares against custom collections, not the default ones', () => {
    expect(validateCollectionName('Must Visit', existing)).toEqual({ ok: true, name: 'Must Visit' });
  });

  it('AC5 lets a collection being renamed keep its own name with different case', () => {
    expect(validateCollectionName('LISBON FOOD', existing, 'food')).toEqual({ ok: true, name: 'LISBON FOOD' });
  });

  it("AC5 refuses renaming to another collection's name", () => {
    expect(validateCollectionName('museums', existing, 'food')).toEqual({ ok: false, error: 'duplicate' });
  });
});

describe('default collections', () => {
  it('AC3 are the four fixed collections, in order, recognised by id', () => {
    expect(DEFAULT_COLLECTIONS.map(({ id }) => id)).toEqual([
      'want-to-visit',
      'must-visit',
      'favorite-restaurants',
      'favorite-attractions',
    ]);
    expect(DEFAULT_COLLECTIONS.every(({ id }) => isDefaultCollectionId(id))).toBe(true);
    expect(isDefaultCollectionId('food')).toBe(false);
  });
});
